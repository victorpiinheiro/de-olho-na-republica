import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { extrairNormaJuridica, toProposicao } from "@/lib/sources/camara/adapter";
import { buscarProposicao, listarTramitacoes } from "@/lib/sources/camara/client";

const CONCORRENCIA = 4;

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

// Reatualiza situação e número da lei das proposições já guardadas. O sync-votacoes só
// toca nas proposições de votações recentes; uma lei sancionada semanas depois da votação
// só é percebida aqui. Proposição que já é lei e já tem número está fechada: fica de fora.
runJob("sync-proposicoes", async () => {
  const pendentes = await db.proposicao.findMany({
    where: { casa: "CAMARA", NOT: { virouLei: true, normaJuridica: { not: null } } },
    select: { id: true, idOrigem: true, virouLei: true, normaJuridica: true },
  });

  const resumo = { viraramLei: 0, numerosPreenchidos: 0, semNumero: 0, atualizadas: 0 };
  const falhas: { idOrigem: string; erro: string }[] = [];

  await emParalelo(pendentes, CONCORRENCIA, async (p) => {
    try {
      const dados = toProposicao(await buscarProposicao(Number(p.idOrigem)));
      let normaJuridica = p.normaJuridica;

      if (dados.virouLei && normaJuridica === null) {
        normaJuridica = extrairNormaJuridica(await listarTramitacoes(Number(p.idOrigem)));
        if (normaJuridica) resumo.numerosPreenchidos++;
        else resumo.semNumero++;
      }
      if (dados.virouLei && !p.virouLei) resumo.viraramLei++;

      await db.proposicao.update({ where: { id: p.id }, data: { ...dados, normaJuridica } });
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
