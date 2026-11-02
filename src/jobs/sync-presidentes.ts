import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { comFotos, toPresidentes } from "@/lib/sources/wikidata/adapter";
import { arquivoDaFoto } from "@/lib/sources/wikidata/commons";
import { buscarFotos, buscarMandatos, buscarMetadadosCommons, buscarPartidos } from "@/lib/sources/wikidata/client";

const data = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Sem foto, todos os campos ficam nulos (limpa uma foto que deixou de ter licença conhecida).
const camposFoto = (f: { url: string; autor: string | null; licenca: string; licencaUrl: string | null; pagina: string } | null) => ({
  fotoUrl: f?.url ?? null,
  fotoAutor: f?.autor ?? null,
  fotoLicenca: f?.licenca ?? null,
  fotoLicencaUrl: f?.licencaUrl ?? null,
  fotoPagina: f?.pagina ?? null,
});

// Carga única (workflow_dispatch): presidentes, mandatos e foto do Wikidata, com autor e licença da foto no Commons.
// Busca e valida tudo antes de gravar. Idempotente: upsert pelo id do Wikidata; os mandatos da pessoa são substituídos.
runJob("sync-presidentes", async () => {
  const base = toPresidentes(await buscarMandatos(), await buscarPartidos());
  const fotos = await buscarFotos();
  const commons = await buscarMetadadosCommons([...new Set(fotos.map((f) => arquivoDaFoto(f.foto.value)))]);
  const { presidentes, semFoto } = comFotos(base, fotos, commons);
  if (semFoto.length > 0) log("warn", "presidentes sem foto ou sem licença conhecida", { presidentes: semFoto });

  for (const p of presidentes) {
    await db.$transaction(async (tx) => {
      const { id } = await tx.presidente.upsert({
        where: { wikidataId: p.wikidataId },
        create: { wikidataId: p.wikidataId, nome: p.nome, partidos: p.partidos, ...camposFoto(p.foto) },
        update: { nome: p.nome, partidos: p.partidos, ...camposFoto(p.foto) },
      });
      await tx.mandatoPresidencial.deleteMany({ where: { presidenteId: id } });
      await tx.mandatoPresidencial.createMany({
        data: p.mandatos.map((m) => ({ presidenteId: id, inicio: data(m.inicio), fim: m.fim ? data(m.fim) : null })),
      });
    });
  }

  return {
    presidentes: presidentes.length,
    mandatos: presidentes.reduce((s, p) => s + p.mandatos.length, 0),
    comFoto: presidentes.filter((p) => p.foto).length,
    semFoto: semFoto.length,
  };
});
