import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { extrairNorma, extrairVigencia, toAutores, toProposicao } from "@/lib/sources/camara/adapter";
import {
  buscarProposicao,
  listarAutores,
  listarMedidasProvisorias,
  listarTramitacoes,
} from "@/lib/sources/camara/client";

// Legislatura atual (57ª): começou em fevereiro de 2023. O limite de 500 MB do banco manda não voltar mais que isso.
const PRIMEIRO_ANO = 2023;
const CONCORRENCIA = 4;
// Situações oficiais em que a MPV não muda mais. Nesses casos só a primeira carga a busca.
const SITUACOES_FECHADAS = ["Perdeu a Eficácia", "Tramitação Finalizada"];

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

// Medidas provisórias da Câmara (a API lista todas, inclusive as que nunca foram a plenário), com a vigência
// lida da tramitação. O sync de votações só conhece as que já foram votadas.
// Idempotente: upsert por (casa, idOrigem), a mesma chave do sync-votacoes.
runJob("sync-medidas-provisorias", async () => {
  const anoAtual = new Date().getFullYear();
  const listas = [];
  for (let ano = PRIMEIRO_ANO; ano <= anoAtual; ano++) listas.push(...(await listarMedidasProvisorias(ano)));

  const existentes = await db.proposicao.findMany({
    where: { casa: "CAMARA", siglaTipo: "MPV" },
    select: { idOrigem: true, situacao: true, virouLei: true, normaJuridica: true, dataLei: true },
  });
  const porId = new Map(existentes.map((p) => [p.idOrigem, p]));
  const fechada = (id: number) => {
    const p = porId.get(String(id));
    if (!p) return false;
    const leiCompleta = p.virouLei && p.normaJuridica !== null && p.dataLei !== null;
    return leiCompleta || (p.situacao !== null && SITUACOES_FECHADAS.includes(p.situacao));
  };
  const abertas = listas.filter((m) => !fechada(m.id));

  const parlamentares = await db.parlamentar.findMany({ select: { id: true, idOrigem: true } });
  const idPorOrigem = new Map(parlamentares.map((p) => [p.idOrigem, p.id]));

  const resumo = { novas: 0, atualizadas: 0, semVigencia: 0 };
  const falhas: { id: number; erro: string }[] = [];

  await emParalelo(abertas, CONCORRENCIA, async (m) => {
    try {
      const [prop, tramitacoes, autores] = await Promise.all([
        buscarProposicao(m.id),
        listarTramitacoes(m.id),
        listarAutores(m.id),
      ]);
      const dados = toProposicao(prop);
      const vigencia = extrairVigencia(tramitacoes);
      if (!vigencia) resumo.semVigencia++;
      const achada = dados.virouLei ? extrairNorma(tramitacoes) : null;
      const campos = {
        ...dados,
        vigenciaInicio: vigencia?.inicio ?? null,
        vigenciaFim: vigencia?.fim ?? null,
        prorrogada: vigencia?.prorrogada ?? false,
        normaJuridica: achada?.norma ?? null,
        dataLei: achada?.data ?? null,
      };
      const { id } = await db.proposicao.upsert({
        where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
        create: campos,
        // Se a norma não foi achada nesta rodada, não apaga a que já estava gravada.
        update: { ...campos, normaJuridica: achada?.norma ?? undefined, dataLei: achada?.data ?? undefined },
        select: { id: true },
      });
      const novos = toAutores(autores, idPorOrigem);
      await db.$transaction([
        db.autor.deleteMany({ where: { proposicaoId: id } }),
        db.autor.createMany({ data: novos.map((a) => ({ ...a, proposicaoId: id })) }),
      ]);
      if (porId.has(dados.idOrigem)) resumo.atualizadas++;
      else resumo.novas++;
    } catch (e) {
      falhas.push({ id: m.id, erro: e instanceof Error ? e.message : String(e) });
    }
  });

  if (falhas.length > 0) {
    throw new Error(`${falhas.length} de ${abertas.length} medidas provisórias falharam`, { cause: falhas.slice(0, 5) });
  }
  return { naFonte: listas.length, buscadas: abertas.length, ...resumo };
});
