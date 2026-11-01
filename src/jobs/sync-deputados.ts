import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { unirDeputados } from "@/lib/sources/camara/adapter";
import { listarDeputados } from "@/lib/sources/camara/client";

const LEGISLATURA = 57;

runJob("sync-deputados", async () => {
  const [daLegislatura, emExercicio] = await Promise.all([
    listarDeputados(LEGISLATURA),
    listarDeputados(),
  ]);
  if (emExercicio.length === 0) throw new Error("a API devolveu 0 deputados em exercício");

  const deputados = unirDeputados(daLegislatura, emExercicio);

  const noBanco = new Map(
    (await db.parlamentar.findMany({ where: { casa: "CAMARA" } })).map((p) => [p.idOrigem, p]),
  );
  const novos = deputados.filter((d) => !noBanco.has(d.idOrigem));
  const alterados = deputados.filter((d) => {
    const p = noBanco.get(d.idOrigem);
    return (
      p &&
      (p.nome !== d.nome ||
        p.partido !== d.partido ||
        p.uf !== d.uf ||
        p.fotoUrl !== d.fotoUrl ||
        p.email !== d.email ||
        p.ativo !== d.ativo ||
        p.legislatura !== d.legislatura)
    );
  });

  await db.parlamentar.createMany({ data: novos, skipDuplicates: true });
  for (const { casa, idOrigem, ...dados } of alterados) {
    await db.parlamentar.update({ where: { casa_idOrigem: { casa, idOrigem } }, data: dados });
  }

  // Quem não veio da API em nenhuma das listas deixa de estar ativo.
  const vistos = deputados.map((d) => d.idOrigem);
  const desativados = await db.parlamentar.updateMany({
    where: { casa: "CAMARA", ativo: true, idOrigem: { notIn: vistos } },
    data: { ativo: false },
  });

  return {
    deputados: deputados.length,
    emExercicio: emExercicio.length,
    novos: novos.length,
    alterados: alterados.length,
    desativados: desativados.count,
  };
});
