import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { atualizarProposicaoSenado } from "@/lib/sync/proposicao-senado";
import { mapaNomesSenadores } from "@/lib/sync/senadores";

const CONCORRENCIA = 4;

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

// Reatualiza situação e número da norma das proposições do Senado já guardadas: uma lei
// sancionada semanas depois da votação só é percebida aqui. Quem já virou lei e já tem o
// número está fechado e fica de fora.
runJob("sync-proposicoes-senado", async () => {
  const pendentes = await db.proposicao.findMany({
    where: { casa: "SENADO", NOT: { virouLei: true, normaJuridica: { not: null }, dataLei: { not: null } } },
    select: { idOrigem: true, virouLei: true },
  });
  const idPorNome = await mapaNomesSenadores();

  const resumo = { viraramLei: 0, atualizadas: 0 };
  const falhas: { idOrigem: string; erro: string }[] = [];

  await emParalelo(pendentes, CONCORRENCIA, async (p) => {
    try {
      await atualizarProposicaoSenado(Number(p.idOrigem), idPorNome);
      resumo.atualizadas++;
    } catch (e) {
      falhas.push({ idOrigem: p.idOrigem, erro: e instanceof Error ? e.message : String(e) });
    }
  });

  if (falhas.length > 0) {
    throw new Error(`${falhas.length} de ${pendentes.length} proposições falharam`, {
      cause: falhas.slice(0, 5),
    });
  }
  return { pendentes: pendentes.length, ...resumo };
});
