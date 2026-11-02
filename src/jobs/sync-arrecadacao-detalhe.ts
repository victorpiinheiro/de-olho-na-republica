import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { paginaDaTabela } from "@/lib/sources/receita/adapter";
import { baixarAnalisePorMes } from "@/lib/sources/receita/client";
import { lerTabelaI, lerTabelaVII, CATEGORIAS_BASE, type LinhaTributo } from "@/lib/sources/receita/detalhe";
import { pdfParaTexto } from "@/lib/sources/receita/pdf";

// Arrecadação federal aberta por tributo (Tabela I) e por base de incidência (Tabela VII).
// Percorre os relatórios mensais do ano anterior até o último publicado. Cada Tabela I traz 3 colunas
// (mês, mês anterior, mesmo mês do ano anterior), então os relatórios que faltam no endereço padrão são
// cobertos pelos vizinhos. Relatório mais novo prevalece: a Receita revisa valores.
// Idempotente: upsert em lote pela chave [ano, mes, codigo].

function mesAtualBr(): { ano: number; mes: number } {
  const [ano, mes] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  return { ano, mes };
}

interface Registro extends LinhaTributo {
  ano: number;
  mes: number;
}

runJob("sync-arrecadacao-detalhe", async () => {
  const modelo = process.env.RECEITA_ANALISE_URL;
  if (!modelo) throw new Error("RECEITA_ANALISE_URL não definida");

  const hoje = mesAtualBr();
  const relatorios: { ano: number; mes: number }[] = [];
  for (let ano = hoje.ano - 1; ano <= hoje.ano; ano++) {
    for (let mes = 1; mes <= 12; mes++) {
      if (ano === hoje.ano && mes >= hoje.mes) break; // o relatório do mês M sai em M+1
      relatorios.push({ ano, mes });
    }
  }

  const porMes = new Map<string, Registro[]>(); // `${ano}-${mes}` → linhas; relatório mais novo sobrescreve
  let ultimo: { ano: number; mes: number; texto: string } | null = null;
  const semRelatorio: string[] = [];

  for (const r of relatorios) {
    const pdf = await baixarAnalisePorMes(modelo, r.ano, r.mes);
    if (!pdf) {
      semRelatorio.push(`${r.mes}/${r.ano}`);
      continue;
    }
    const texto = await pdfParaTexto(pdf);
    const tabela = lerTabelaI(paginaDaTabela(texto, "TABELA I"));
    tabela.colunas.forEach((col, c) => {
      porMes.set(
        `${col.ano}-${col.mes}`,
        tabela.linhas.map((l) => ({ ...l, ano: col.ano, mes: col.mes, valores: [l.valores[c]] })),
      );
    });
    ultimo = { ...r, texto };
  }
  if (!ultimo) throw new Error("nenhum relatório mensal da Receita encontrado");

  // Meses esperados: de jan do ano anterior até o último relatório. O do último relatório é obrigatório.
  const esperados: string[] = [];
  for (let ano = hoje.ano - 1; ano <= ultimo.ano; ano++) {
    for (let mes = 1; mes <= (ano === ultimo.ano ? ultimo.mes : 12); mes++) esperados.push(`${ano}-${mes}`);
  }
  const faltando = esperados.filter((k) => !porMes.has(k));
  if (faltando.includes(`${ultimo.ano}-${ultimo.mes}`)) throw new Error(`mês ${ultimo.mes}/${ultimo.ano} ausente`);
  if (faltando.length > 0) log("warn", "meses sem dado detalhado", { meses: faltando });

  // Só os anos que a tela usa: a coluna "ano anterior" de janeiro de 2025 traria meses soltos de 2024.
  const registros = [...porMes.values()].flat().filter((r) => r.ano >= hoje.ano - 1);
  await gravarDetalhe(registros);

  // Confere com a Tabela III que o sync-arrecadacao já gravou (mesmo total das receitas administradas pela RFB).
  const gravados = await db.arrecadacao.groupBy({
    by: ["ano", "mes"],
    where: { esfera: "FEDERAL", estimado: false },
    _sum: { valor: true },
  });
  const divergencias: string[] = [];
  for (const g of gravados) {
    const linhas = porMes.get(`${g.ano}-${g.mes}`);
    if (!linhas) continue;
    const detalhe = linhas.filter((l) => l.nivel === 0).reduce((s, l) => s + l.valores[0], 0);
    const diferenca = Math.abs(detalhe - Number(g._sum.valor ?? 0));
    if (diferenca > 5e6) divergencias.push(`${g.mes}/${g.ano}: ${(diferenca / 1e6).toFixed(0)} mi`);
  }
  if (divergencias.length > 0) log("warn", "total do detalhe difere da Tabela III", { meses: divergencias });

  // Base de incidência (Tabela VII) do relatório mais recente: ano anterior fechado e ano atual até o mês do relatório.
  const base = lerTabelaVII(paginaDaTabela(ultimo.texto, "TABELA VII"));
  const linhasBase = [ultimo.ano - 1, ultimo.ano].flatMap((ano) => {
    const a = base.find((b) => b.ano === ano);
    if (!a) throw new Error(`Tabela VII sem o ano ${ano}`);
    return CATEGORIAS_BASE.map((categoria) => ({
      ano,
      ateMes: ano === ultimo!.ano ? ultimo!.mes : 12,
      categoria,
      valor: a.valores[categoria],
    }));
  });
  await db.$transaction(
    linhasBase.map((l) =>
      db.arrecadacaoFederalBase.upsert({
        where: { ano_categoria: { ano: l.ano, categoria: l.categoria } },
        create: l,
        update: { ateMes: l.ateMes, valor: l.valor },
      }),
    ),
  );

  return {
    relatorios: relatorios.length - semRelatorio.length,
    semRelatorio: semRelatorio.length,
    meses: new Set(registros.map((r) => `${r.ano}-${r.mes}`)).size,
    mesesFaltando: faltando.length,
    linhasDetalhe: registros.length,
    linhasBase: linhasBase.length,
    divergenciasComTabelaIII: divergencias.length,
  };
});

// Um único INSERT ... ON CONFLICT com arrays (centenas de upserts em fila levariam minutos, a ~1 s cada ida ao banco).
async function gravarDetalhe(registros: Registro[]) {
  await db.$executeRaw`
    INSERT INTO "ArrecadacaoFederalDetalhe" ("ano", "mes", "codigo", "nome", "pai", "nivel", "valor")
    SELECT * FROM unnest(
      ${registros.map((r) => r.ano)}::int[],
      ${registros.map((r) => r.mes)}::int[],
      ${registros.map((r) => r.codigo)}::text[],
      ${registros.map((r) => r.nome)}::text[],
      ${registros.map((r) => r.pai)}::text[],
      ${registros.map((r) => r.nivel)}::int[],
      ${registros.map((r) => String(r.valores[0]))}::numeric[]
    )
    ON CONFLICT ("ano", "mes", "codigo") DO UPDATE
      SET "nome" = EXCLUDED."nome", "pai" = EXCLUDED."pai", "nivel" = EXCLUDED."nivel", "valor" = EXCLUDED."valor"`;
}
