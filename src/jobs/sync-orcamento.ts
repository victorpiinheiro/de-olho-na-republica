import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { toDespesas, type OrcamentoUniao } from "@/lib/sources/siconfi/orcamento";
import { buscarDespesasUniao } from "@/lib/sources/siconfi/client";

const BIMESTRES = 6;

const anoAtualBr = () =>
  Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));

// Último bimestre já publicado do ano (6 → 1); null se nenhum.
async function ultimoBimestre(ano: number): Promise<{ bimestre: number; orcamento: OrcamentoUniao } | null> {
  for (let b = BIMESTRES; b >= 1; b--) {
    const linhas = await buscarDespesasUniao(ano, b);
    if (linhas.length > 0) return { bimestre: b, orcamento: toDespesas(linhas, ano, b) };
    log("info", "bimestre ainda não publicado", { ano, bimestre: b });
  }
  return null;
}

// Orçamento da União por função e subfunção (Siconfi, RREO-Anexo 02), acumulado até o último bimestre
// publicado de cada ano. Valida tudo antes de gravar. Idempotente: o conjunto (ano, bimestre) é substituído.
runJob("sync-orcamento", async () => {
  const ano = anoAtualBr();
  const resumo: Record<string, unknown> = {};

  for (const a of [ano - 1, ano]) {
    const r = await ultimoBimestre(a);
    if (!r) {
      if (a === ano) {
        log("warn", "nenhum bimestre do ano atual publicado ainda", { ano: a });
        continue;
      }
      throw new Error(`nenhum bimestre de ${a} publicado`);
    }
    await db.$transaction([
      db.despesaFuncao.deleteMany({ where: { ano: a, bimestre: r.bimestre } }),
      db.despesaFuncao.createMany({
        data: r.orcamento.linhas.map((l) => ({ ano: a, bimestre: r.bimestre, ...l })),
      }),
    ]);
    resumo[`ano${a}`] = { bimestre: r.bimestre, linhas: r.orcamento.linhas.length, liquidadoBi: Math.round(r.orcamento.total.liquidado / 1e9) };
  }
  return resumo;
});
