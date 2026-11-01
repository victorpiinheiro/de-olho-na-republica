import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { toDespesa } from "@/lib/sources/camara/adapter";
import { lerDespesasCsv, type LinhaInvalida } from "@/lib/sources/camara/client";

const LOTE = 1000;
// Acima disso o formato da fonte provavelmente mudou: melhor quebrar do que gravar errado.
const MAX_INVALIDAS = 0.01;

// Uso: tsx sync-despesas.ts [ano ...]   (padrão: ano corrente)
const anos = process.argv.slice(2).map(Number);
if (anos.length === 0) anos.push(new Date().getFullYear());

runJob("sync-despesas", async () => {
  const modelo = process.env.CAMARA_DESPESAS_CSV_URL;
  if (!modelo?.includes("{ano}")) {
    throw new Error("defina CAMARA_DESPESAS_CSV_URL com o marcador {ano}");
  }

  const parlamentares = await db.parlamentar.findMany({
    where: { casa: "CAMARA" },
    select: { id: true, idOrigem: true },
  });
  const idPorOrigem = new Map(parlamentares.map((p) => [p.idOrigem, p.id]));
  if (idPorOrigem.size === 0) throw new Error("sem parlamentares: rode sync-deputados antes");

  const resumo: Record<string, unknown> = {};

  for (const ano of anos) {
    const invalidas: LinhaInvalida[] = [];
    const doArquivo = new Map<string, ReturnType<typeof toDespesa>>();
    let lidas = 0;
    let semParlamentar = 0;

    for await (const linha of lerDespesasCsv(modelo.replace("{ano}", String(ano)), invalidas)) {
      lidas++;
      const d = toDespesa(linha);
      if (!idPorOrigem.has(d.idOrigemDeputado)) {
        semParlamentar++;
        continue;
      }
      doArquivo.set(d.hash, d);
    }

    const total = lidas + invalidas.length;
    if (total === 0 || invalidas.length / total > MAX_INVALIDAS) {
      throw new Error(`${ano}: ${invalidas.length} de ${total} linhas inválidas`, {
        cause: invalidas.slice(0, 3),
      });
    }

    const noBanco = new Set(
      (
        await db.despesa.findMany({
          // Só da Câmara: despesas do Senado têm outra origem e não podem ser tratadas como removidas.
          where: { ano, parlamentar: { casa: "CAMARA" } },
          select: { hash: true },
        })
      ).map((d) => d.hash),
    );
    const novas = [...doArquivo.values()].filter((d) => !noBanco.has(d.hash));
    const removidas = [...noBanco].filter((h) => !doArquivo.has(h));

    for (let i = 0; i < novas.length; i += LOTE) {
      await db.despesa.createMany({
        skipDuplicates: true,
        data: novas.slice(i, i + LOTE).map(({ idOrigemDeputado, ...d }) => ({
          ...d,
          parlamentarId: idPorOrigem.get(idOrigemDeputado)!,
        })),
      });
    }
    for (let i = 0; i < removidas.length; i += LOTE) {
      await db.despesa.deleteMany({ where: { hash: { in: removidas.slice(i, i + LOTE) } } });
    }

    const duplicadas = lidas - semParlamentar - doArquivo.size;
    log("info", "ano sincronizado", {
      ano,
      lidas,
      invalidas: invalidas.length,
      semParlamentar,
      duplicadas,
      inseridas: novas.length,
      removidas: removidas.length,
    });
    resumo[ano] = { gravadas: doArquivo.size, inseridas: novas.length, removidas: removidas.length };
  }

  return resumo;
});
