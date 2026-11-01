import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { toPresidentes } from "@/lib/sources/wikidata/adapter";
import { buscarMandatos, buscarPartidos } from "@/lib/sources/wikidata/client";

const data = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Carga única (workflow_dispatch): presidentes e mandatos do Wikidata.
// Busca e valida tudo antes de gravar. Idempotente: upsert pelo id do Wikidata; os mandatos da pessoa são substituídos.
runJob("sync-presidentes", async () => {
  const presidentes = toPresidentes(await buscarMandatos(), await buscarPartidos());

  for (const p of presidentes) {
    await db.$transaction(async (tx) => {
      const { id } = await tx.presidente.upsert({
        where: { wikidataId: p.wikidataId },
        create: { wikidataId: p.wikidataId, nome: p.nome, partidos: p.partidos },
        update: { nome: p.nome, partidos: p.partidos },
      });
      await tx.mandatoPresidencial.deleteMany({ where: { presidenteId: id } });
      await tx.mandatoPresidencial.createMany({
        data: p.mandatos.map((m) => ({ presidenteId: id, inicio: data(m.inicio), fim: m.fim ? data(m.fim) : null })),
      });
    });
  }

  return { presidentes: presidentes.length, mandatos: presidentes.reduce((s, p) => s + p.mandatos.length, 0) };
});
