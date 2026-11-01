import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { toDespesaCeaps } from "@/lib/sources/senado/adapter";
import { listarDespesasCeaps } from "@/lib/sources/senado/client";
import { carregarSenadores, garantirSenadores } from "@/lib/sync/senadores";

const LOTE = 1000;
// Acima disso o formato da fonte provavelmente mudou: melhor quebrar do que gravar errado.
const MAX_INVALIDAS = 0.01;

// Uso: tsx sync-ceaps.ts [ano ...]   (padrão: ano corrente)
const anos = process.argv.slice(2).map(Number);
if (anos.length === 0) anos.push(new Date().getFullYear());

runJob("sync-ceaps", async () => {
  const modelo = process.env.SENADO_CEAPS_URL;
  if (!modelo?.includes("{ano}")) throw new Error("defina SENADO_CEAPS_URL com o marcador {ano}");

  const fonte = await carregarSenadores();
  const resumo: Record<string, unknown> = {};

  for (const ano of anos) {
    const { validas, invalidas } = await listarDespesasCeaps(modelo.replace("{ano}", String(ano)));

    const total = validas.length + invalidas.length;
    if (total === 0 || invalidas.length / total > MAX_INVALIDAS) {
      throw new Error(`${ano}: ${invalidas.length} de ${total} linhas inválidas`, {
        cause: invalidas.slice(0, 3),
      });
    }

    // O endpoint é por ano de competência; linha de outro ano seria sinal de mudança na fonte.
    const doAno = validas.filter((r) => r.ano === ano);
    const foraDoAno = validas.length - doAno.length;
    if (foraDoAno > 0) throw new Error(`${ano}: ${foraDoAno} linhas de outro ano de competência`);

    const { idPorOrigem, criados } = await garantirSenadores(
      new Set(doAno.map((r) => r.codSenador)),
      fonte,
    );

    const toDespesa = (r: (typeof doAno)[number]) => {
      const { idOrigemSenador, ...d } = toDespesaCeaps(r);
      return { ...d, parlamentarId: idPorOrigem.get(idOrigemSenador)! };
    };
    const doArquivo = new Map<string, ReturnType<typeof toDespesa>>();
    for (const r of doAno) {
      const d = toDespesa(r);
      doArquivo.set(d.hash, d);
    }

    const noBanco = new Set(
      (
        await db.despesa.findMany({
          where: { ano, parlamentar: { casa: "SENADO" } },
          select: { hash: true },
        })
      ).map((d) => d.hash),
    );
    const novas = [...doArquivo.values()].filter((d) => !noBanco.has(d.hash));
    const removidas = [...noBanco].filter((h) => !doArquivo.has(h));

    for (let i = 0; i < novas.length; i += LOTE) {
      await db.despesa.createMany({
        skipDuplicates: true,
        data: novas.slice(i, i + LOTE),
      });
    }
    for (let i = 0; i < removidas.length; i += LOTE) {
      await db.despesa.deleteMany({ where: { hash: { in: removidas.slice(i, i + LOTE) } } });
    }

    log("info", "ano sincronizado", {
      ano,
      lidas: validas.length,
      invalidas: invalidas.length,
      senadoresCriados: criados,
      duplicadas: doAno.length - doArquivo.size,
      inseridas: novas.length,
      removidas: removidas.length,
    });
    resumo[ano] = { gravadas: doArquivo.size, inseridas: novas.length, removidas: removidas.length };
  }
  return resumo;
});
