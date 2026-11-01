import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { toParlamentarSenador } from "@/lib/sources/senado/adapter";
import { carregarSenadores, LEGISLATURA_SENADO } from "@/lib/sync/senadores";

// Mantém os senadores em exercício (e o flag `ativo` de quem saiu). Quem só aparece em despesas
// ou votos é criado sob demanda pelos outros jobs.
runJob("sync-senadores", async () => {
  const { atuais, ativos } = await carregarSenadores();
  if (atuais.length === 0) throw new Error("a API devolveu 0 senadores em exercício");

  const senadores = atuais.map((s) => toParlamentarSenador(s, true, LEGISLATURA_SENADO));
  const noBanco = new Map(
    (await db.parlamentar.findMany({ where: { casa: "SENADO" } })).map((p) => [p.idOrigem, p]),
  );

  const novos = senadores.filter((s) => !noBanco.has(s.idOrigem));
  const alterados = senadores.filter((s) => {
    const p = noBanco.get(s.idOrigem);
    return (
      p &&
      (p.nome !== s.nome ||
        p.nomeCivil !== s.nomeCivil ||
        p.partido !== s.partido ||
        p.uf !== s.uf ||
        p.fotoUrl !== s.fotoUrl ||
        p.email !== s.email ||
        p.ativo !== s.ativo ||
        p.legislatura !== s.legislatura)
    );
  });

  await db.parlamentar.createMany({ data: novos, skipDuplicates: true });
  for (const { casa, idOrigem, ...dados } of alterados) {
    await db.parlamentar.update({ where: { casa_idOrigem: { casa, idOrigem } }, data: dados });
  }

  const desativados = await db.parlamentar.updateMany({
    where: {
      casa: "SENADO",
      ativo: true,
      idOrigem: { notIn: [...ativos].map(String) },
    },
    data: { ativo: false },
  });

  return {
    emExercicio: senadores.length,
    novos: novos.length,
    alterados: alterados.length,
    desativados: desativados.count,
  };
});
