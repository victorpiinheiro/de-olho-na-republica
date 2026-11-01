import { db } from "@/lib/db";
import { diasAtras, intervalosMensais } from "@/lib/datas";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import {
  classificarVotos,
  proposicaoPrincipal,
  toAutores,
  toOrientacoes,
  toProposicao,
  toVotacao,
} from "@/lib/sources/camara/adapter";
import {
  buscarProposicao,
  buscarVotacao,
  listarAutores,
  listarOrientacoes,
  listarVotacoesPlenario,
  listarVotos,
} from "@/lib/sources/camara/client";

const CONCORRENCIA = 4;
const LOTE = 1000;

// Uso: tsx sync-votacoes.ts [--desde=YYYY-MM-DD] [--ate=YYYY-MM-DD]
// Padrão: últimos 7 dias. Reprocessa a janela inteira: uma votação que parecia simbólica
// pode ganhar votos publicados depois, e o upsert corrige.
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const ate = arg("ate") ?? diasAtras(0);
const desde = arg("desde") ?? diasAtras(7);
for (const d of [desde, ate]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`data inválida: ${d}`);
}

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

runJob("sync-votacoes", async () => {
  const parlamentares = await db.parlamentar.findMany({
    where: { casa: "CAMARA" },
    select: { id: true, idOrigem: true },
  });
  if (parlamentares.length === 0) throw new Error("sem parlamentares: rode sync-deputados antes");
  const idPorOrigem = new Map(parlamentares.map((p) => [p.idOrigem, p.id]));

  const ids = new Set<string>();
  for (const [ini, fim] of intervalosMensais(desde, ate)) {
    for (const v of await listarVotacoesPlenario(ini, fim)) ids.add(v.id);
  }
  log("info", "votações listadas", { desde, ate, total: ids.size });

  // Uma proposição é buscada uma vez por execução, mesmo com várias votações.
  const proposicoes = new Map<number, Promise<number>>();
  function garantirProposicao(idOrigem: number) {
    let p = proposicoes.get(idOrigem);
    if (!p) {
      p = (async () => {
        const [prop, autores] = await Promise.all([buscarProposicao(idOrigem), listarAutores(idOrigem)]);
        const dados = toProposicao(prop);
        const { id } = await db.proposicao.upsert({
          where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
          create: dados,
          update: dados,
          select: { id: true },
        });
        const novos = toAutores(autores, idPorOrigem);
        await db.$transaction([
          db.autor.deleteMany({ where: { proposicaoId: id } }),
          db.autor.createMany({ data: novos.map((a) => ({ ...a, proposicaoId: id })) }),
        ]);
        return id;
      })();
      proposicoes.set(idOrigem, p);
    }
    return p;
  }

  const resumo = { nominais: 0, simbolicas: 0, secretas: 0, semProposicao: 0, votosGravados: 0 };
  const falhas: { id: string; erro: string }[] = [];

  await emParalelo([...ids], CONCORRENCIA, async (idVotacao) => {
    try {
      const [votacao, votosApi, orientacoesApi] = await Promise.all([
        buscarVotacao(idVotacao),
        listarVotos(idVotacao),
        listarOrientacoes(idVotacao),
      ]);

      const classificacao = classificarVotos(votosApi);
      const principal = proposicaoPrincipal(votacao.proposicoesAfetadas);
      const proposicaoId = principal ? await garantirProposicao(principal.id) : null;

      const dados = { ...toVotacao(votacao, classificacao), proposicaoId };
      const votos = classificacao.votos.map((v) => {
        const parlamentarId = idPorOrigem.get(v.idOrigemDeputado);
        if (parlamentarId === undefined) {
          throw new Error(`deputado ${v.idOrigemDeputado} da votação não está no banco`);
        }
        return { parlamentarId, partido: v.partido, voto: v.voto };
      });

      const existente = await db.votacao.findUnique({
        where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
        select: { id: true, _count: { select: { votos: true } } },
      });
      const { id } = await db.votacao.upsert({
        where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
        create: dados,
        update: dados,
        select: { id: true },
      });

      // Votos só são regravados quando mudaram (a contagem basta: votos publicados não se alteram).
      if (!existente || existente._count.votos !== votos.length) {
        await db.voto.deleteMany({ where: { votacaoId: id } });
        for (let i = 0; i < votos.length; i += LOTE) {
          await db.voto.createMany({
            data: votos.slice(i, i + LOTE).map((v) => ({ ...v, votacaoId: id })),
          });
        }
        resumo.votosGravados += votos.length;
      }

      await db.$transaction([
        db.orientacaoPartido.deleteMany({ where: { votacaoId: id } }),
        db.orientacaoPartido.createMany({
          data: toOrientacoes(orientacoesApi).map((o) => ({ ...o, votacaoId: id })),
        }),
      ]);

      if (classificacao.tipo === "nominal") resumo.nominais++;
      else if (classificacao.tipo === "secreta") resumo.secretas++;
      else resumo.simbolicas++;
      if (!proposicaoId) resumo.semProposicao++;
    } catch (e) {
      falhas.push({ id: idVotacao, erro: e instanceof Error ? e.message : String(e) });
    }
  });

  // As boas já foram gravadas; falha de formato derruba o job para o alerta disparar.
  if (falhas.length > 0) {
    throw new Error(`${falhas.length} de ${ids.size} votações falharam`, {
      cause: falhas.slice(0, 5),
    });
  }

  return { votacoes: ids.size, proposicoes: proposicoes.size, ...resumo };
});
