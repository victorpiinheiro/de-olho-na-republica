import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { emLotes } from "@/lib/lotes";
import { log } from "@/lib/log";
import { liquido, toReceitaEstadual, type ReceitaEstadual } from "@/lib/sources/siconfi/dca";
import { buscarDcaReceita, listarEstados } from "@/lib/sources/siconfi/client";

// Receita tributária anual dos estados, BRUTA e com deduções (DCA Anexo I-C, Tesouro): ICMS, IPVA, ITCMD,
// IR retido e taxas por tipo. Anual: a DCA de um ano sai por volta de abril do ano seguinte.
// Um ano só entra quando os 27 estados já enviaram, para a tela nunca mostrar um total nacional parcial.
// Idempotente: upsert em lote pela chave [ano, uf, codConta].

const SIMULTANEAS = 5;
const ESTADOS_ESPERADOS = 27; // 26 estados + DF
const ANOS_ATRAS = 2;

const anoAtualBr = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));

const SIGLA_POR_IBGE: Record<number, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN",
  25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC",
  43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
};

runJob("sync-receita-estadual", async () => {
  const estados = await listarEstados();
  if (estados.length !== ESTADOS_ESPERADOS) throw new Error(`esperava ${ESTADOS_ESPERADOS} entes estaduais, vieram ${estados.length}`);
  for (const e of estados) if (!SIGLA_POR_IBGE[e.codIbge]) throw new Error(`ente estadual desconhecido: ${e.codIbge} ${e.nome}`);

  const atual = anoAtualBr();
  const publicados: number[] = [];
  const parciais: string[] = [];
  let linhas = 0;
  const divergencias: string[] = [];

  for (let ano = atual; ano >= atual - ANOS_ATRAS; ano--) {
    const respostas = await emLotes(estados, SIMULTANEAS, async (e) => ({
      uf: SIGLA_POR_IBGE[e.codIbge],
      dca: await buscarDcaReceita(ano, e.codIbge),
    }));
    const com = respostas.filter((r) => r.dca.length > 0);
    if (com.length === 0) {
      log("info", "DCA do ano ainda não publicada", { ano });
      continue;
    }
    if (com.length < ESTADOS_ESPERADOS) {
      parciais.push(`${ano}: ${com.length}/${ESTADOS_ESPERADOS}`);
      log("warn", "DCA do ano incompleta: ano ignorado", { ano, estados: com.length });
      continue;
    }

    const registros = com.flatMap((r) => toReceitaEstadual(r.dca, ano, r.uf));
    await gravar(registros);
    publicados.push(ano);
    linhas += registros.length;
    divergencias.push(...(await compararComRreo(registros, ano)));
  }

  if (publicados.length === 0) throw new Error("nenhuma DCA completa encontrada nos últimos anos");
  if (divergencias.length > 0) log("warn", "DCA líquida difere do RREO (cada estado contabiliza deduções de um jeito)", { divergencias });
  return { anos: publicados, linhas, anosParciais: parciais, divergenciasComRreo: divergencias.length };
});

// Líquido da DCA (impostos + taxas) contra a soma dos 12 meses do RREO já gravados. Só avisa.
async function compararComRreo(registros: ReceitaEstadual[], ano: number): Promise<string[]> {
  const rreo = await db.arrecadacao.groupBy({
    by: ["uf"],
    where: { esfera: "ESTADUAL", ano, estimado: false },
    _sum: { valor: true },
    _count: true,
  });
  const avisos: string[] = [];
  for (const g of rreo) {
    if (g._count < 24) continue; // 12 meses × 2 tributos: só compara com o ano inteiro publicado
    const dca = registros
      .filter((r) => r.uf === g.uf && (r.codConta === "RO1.1.1.0.00.0.0" || r.codConta === "RO1.1.2.0.00.0.0"))
      .reduce((s, r) => s + liquido(r), 0);
    const diferenca = dca - Number(g._sum.valor ?? 0);
    if (Math.abs(diferenca) > 5e5) avisos.push(`${g.uf}/${ano}: ${(diferenca / 1e9).toFixed(2)} bi`);
  }
  return avisos;
}

// Um único INSERT ... ON CONFLICT com arrays, em vez de milhares de upserts em fila.
async function gravar(r: ReceitaEstadual[]) {
  await db.$executeRaw`
    INSERT INTO "ReceitaEstadualAnual"
      ("ano", "uf", "codConta", "conta", "nivel", "bruto", "deducaoFundeb", "deducaoTransferencias", "outrasDeducoes")
    SELECT * FROM unnest(
      ${r.map((x) => x.ano)}::int[],
      ${r.map((x) => x.uf)}::text[],
      ${r.map((x) => x.codConta)}::text[],
      ${r.map((x) => x.conta)}::text[],
      ${r.map((x) => x.nivel)}::int[],
      ${r.map((x) => String(x.bruto))}::numeric[],
      ${r.map((x) => String(x.deducaoFundeb))}::numeric[],
      ${r.map((x) => String(x.deducaoTransferencias))}::numeric[],
      ${r.map((x) => String(x.outrasDeducoes))}::numeric[]
    )
    ON CONFLICT ("ano", "uf", "codConta") DO UPDATE SET
      "conta" = EXCLUDED."conta", "nivel" = EXCLUDED."nivel", "bruto" = EXCLUDED."bruto",
      "deducaoFundeb" = EXCLUDED."deducaoFundeb", "deducaoTransferencias" = EXCLUDED."deducaoTransferencias",
      "outrasDeducoes" = EXCLUDED."outrasDeducoes"`;
}
