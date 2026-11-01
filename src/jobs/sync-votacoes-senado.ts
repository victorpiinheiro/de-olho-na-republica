import { db } from "@/lib/db";
import { diasAtras, intervalosMensais } from "@/lib/datas";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { ehProposicaoNorma } from "@/lib/sources/camara/adapter";
import { classificarVotosSenado, toVotacaoSenado } from "@/lib/sources/senado/adapter";
import { listarVotacoesSenado } from "@/lib/sources/senado/client";
import { atualizarProposicaoSenado } from "@/lib/sync/proposicao-senado";
import { carregarSenadores, garantirSenadores, mapaNomesSenadores } from "@/lib/sync/senadores";

const CONCORRENCIA = 4;
const LOTE = 1000;

// Uso: tsx sync-votacoes-senado.ts [--desde=YYYY-MM-DD] [--ate=YYYY-MM-DD]
// Padrão: últimos 7 dias. Reprocessa a janela inteira; o upsert é idempotente.
// O Senado só publica votações nominais (e secretas); não existe "simbólica" nesse feed.
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

runJob("sync-votacoes-senado", async () => {
  const fonte = await carregarSenadores();

  const porId = new Map<number, Awaited<ReturnType<typeof listarVotacoesSenado>>[number]>();
  for (const [ini, fim] of intervalosMensais(desde, ate)) {
    for (const v of await listarVotacoesSenado(ini, fim)) porId.set(v.codigoSessaoVotacao, v);
  }
  const votacoes = [...porId.values()];
  log("info", "votações listadas", { desde, ate, total: votacoes.length });

  // Em votação secreta não guardamos votos, então só os senadores das nominais precisam existir.
  const codigos = new Set(
    votacoes.filter((v) => v.votacaoSecreta === "N").flatMap((v) => v.votos.map((x) => x.codigoParlamentar)),
  );
  const { idPorOrigem } = await garantirSenadores(codigos, fonte);
  const idPorNome = await mapaNomesSenadores();

  // Uma proposição é buscada uma vez por execução, mesmo com várias votações.
  const proposicoes = new Map<number, Promise<number>>();
  const garantirProposicao = (idProcesso: number) => {
    let p = proposicoes.get(idProcesso);
    if (!p) {
      p = atualizarProposicaoSenado(idProcesso, idPorNome);
      proposicoes.set(idProcesso, p);
    }
    return p;
  };

  const resumo = { nominais: 0, secretas: 0, semProposicao: 0, votosGravados: 0 };
  const falhas: { id: number; erro: string }[] = [];

  await emParalelo(votacoes, CONCORRENCIA, async (v) => {
    try {
      const classificacao = classificarVotosSenado(v);
      // Mensagens (indicação de autoridades), ofícios e requerimentos não são "leis".
      const proposicaoId = ehProposicaoNorma(v.sigla) ? await garantirProposicao(v.idProcesso) : null;

      const dados = { ...toVotacaoSenado(v, classificacao), proposicaoId };
      const votos = classificacao.votos.map((x) => {
        const parlamentarId = idPorOrigem.get(x.idOrigemSenador);
        if (parlamentarId === undefined) {
          throw new Error(`senador ${x.idOrigemSenador} da votação não está no banco`);
        }
        return { parlamentarId, partido: x.partido, voto: x.voto };
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

      // Votos publicados não mudam: a contagem basta para saber se precisa regravar.
      if (!existente || existente._count.votos !== votos.length) {
        await db.voto.deleteMany({ where: { votacaoId: id } });
        for (let i = 0; i < votos.length; i += LOTE) {
          await db.voto.createMany({
            data: votos.slice(i, i + LOTE).map((x) => ({ ...x, votacaoId: id })),
          });
        }
        resumo.votosGravados += votos.length;
      }

      if (classificacao.tipo === "secreta") resumo.secretas++;
      else resumo.nominais++;
      if (!proposicaoId) resumo.semProposicao++;
    } catch (e) {
      falhas.push({ id: v.codigoSessaoVotacao, erro: e instanceof Error ? e.message : String(e) });
    }
  });

  // As boas já foram gravadas; falha de formato derruba o job para o alerta disparar.
  if (falhas.length > 0) {
    throw new Error(`${falhas.length} de ${votacoes.length} votações falharam`, {
      cause: falhas.slice(0, 5),
    });
  }
  return { votacoes: votacoes.length, proposicoes: proposicoes.size, ...resumo };
});
