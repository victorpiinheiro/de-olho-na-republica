import { db } from "@/lib/db";
import { projetarMeses } from "@/lib/impostometro";
import { falhaDeRede } from "@/lib/http";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { buscarPopulacaoBrasil } from "@/lib/sources/ibge/client";
import { lerTabelaMensal, paginaDaTabela, toArrecadacoes } from "@/lib/sources/receita/adapter";
import { baixarUltimaAnalise } from "@/lib/sources/receita/client";
import { pdfParaTexto } from "@/lib/sources/receita/pdf";

// Arrecadação federal mensal (Receita Federal) + projeção dos meses ainda não divulgados + população (IBGE).
// Idempotente: rodar de novo só atualiza; quando um mês estimado passa a oficial, a linha é sobrescrita.
runJob("sync-arrecadacao", async () => {
  const modelo = process.env.RECEITA_ANALISE_URL;
  if (!modelo) throw new Error("RECEITA_ANALISE_URL não definida");

  const analise = await baixarUltimaAnalise(modelo);
  const texto = await pdfParaTexto(analise.pdf);
  const correntes = lerTabelaMensal(paginaDaTabela(texto, "TABELA III"));
  const constantes = lerTabelaMensal(paginaDaTabela(texto, "TABELA III-A"));

  const ano = analise.ano;
  const atual = correntes.find((a) => a.ano === ano);
  if (atual?.meses.length !== analise.mes) {
    throw new Error(`relatório de ${analise.mes}/${ano} traz ${atual?.meses.length ?? 0} meses de ${ano}`);
  }

  const oficiais = toArrecadacoes(correntes, constantes, [ano - 1, ano]);
  const projecao = projetarMeses(ano, oficiais);

  const operacoes = [
    ...oficiais.map((l) => {
      const chave = { esfera: l.esfera, uf: "BR", tributo: l.tributo, ano: l.ano, mes: l.mes };
      return db.arrecadacao.upsert({
        where: { esfera_uf_tributo_ano_mes: chave },
        create: l,
        update: { valor: l.valor, estimado: false, valorReal: l.valorReal },
      });
    }),
    ...projecao.map((l) => {
      const chave = { esfera: "FEDERAL" as const, uf: "BR", tributo: l.tributo, ano: l.ano, mes: l.mes };
      return db.arrecadacao.upsert({
        where: { esfera_uf_tributo_ano_mes: chave },
        create: { ...chave, valor: l.valor, estimado: true, valorReal: null },
        update: { valor: l.valor, estimado: true, valorReal: null },
      });
    }),
  ];
  await db.$transaction(operacoes);

  // A população é uma estimativa ANUAL do IBGE. O computador do GitHub fica nos EUA e o servidor do IBGE às vezes não
  // responde de lá: nesse caso (e só em falha de rede) mantém a última população guardada e avisa, em vez de derrubar a
  // arrecadação do mês. Resposta com formato errado continua derrubando o job.
  let populacao: { ano: number; pessoas: number } | null = null;
  try {
    populacao = await buscarPopulacaoBrasil();
  } catch (e) {
    if (!falhaDeRede(e)) throw e;
    const ultima = await db.indicador.findFirst({ where: { chave: "populacao" }, orderBy: { referencia: "desc" } });
    if (!ultima) throw e; // sem nenhuma população guardada não há o que manter
    log("warn", "IBGE inalcançável: mantida a última população guardada", {
      referencia: ultima.referencia,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
  if (populacao) {
    await db.indicador.upsert({
      where: { chave_referencia: { chave: "populacao", referencia: String(populacao.ano) } },
      create: { chave: "populacao", referencia: String(populacao.ano), valor: populacao.pessoas },
      update: { valor: populacao.pessoas },
    });
  }

  return {
    relatorio: `${analise.mes}/${ano}`,
    mesesOficiais: atual.meses.length,
    linhasOficiais: oficiais.length,
    linhasProjetadas: projecao.length,
    populacao: populacao?.pessoas ?? "mantida a anterior (IBGE inalcançável)",
  };
});
