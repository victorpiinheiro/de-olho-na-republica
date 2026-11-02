import { Prisma, type TipoVoto } from "@prisma/client";
import { db } from "@/lib/db";
import {
  codigo,
  estadoDe,
  autoriaTexto,
  SITUACAO_ARQUIVADA,
  SITUACOES_APROVADA_CAMARA,
  statusDe,
  votacaoDestaque,
  type Aba,
  type CasaLegislativa,
  type EstadoVotacao,
  type VotacaoResumo,
} from "@/lib/leis";

const POR_ABA = 100;

// Ausente e "presente, sem voto" (Senado) não contam como ter votado na presença.
export const SEM_VOTO: TipoVoto[] = ["AUSENTE", "PRESENTE_SEM_VOTO"];

export interface CardLei {
  id: number;
  casa: CasaLegislativa;
  codigo: string;
  ementa: string;
  situacao: string | null;
  virouLei: boolean;
  normaJuridica: string | null;
  status: { rotulo: string; tom: "lei" | "rejeitada" | "neutro" };
  autoria: { texto: string; parlamentarId: number | null } | null;
  totalVotacoes: number;
  destaque: {
    dataIso: string;
    descricao: string;
    aprovada: boolean | null;
    estado: EstadoVotacao;
    sim: number;
    nao: number;
    abst: number;
  } | null;
}

// Condição de cada aba, no banco. Espelha `pertenceAba` (lib/leis.ts); a consulta é comparada com a versão
// em código para as 6 abas antes de qualquer mudança aqui. `v` traz os agregados de votação (tem_nominal e a
// aprovação da última votação).
function condicaoDaAba(aba: Aba): Prisma.Sql {
  switch (aba) {
    case "todas":
      return Prisma.sql`TRUE`;
    case "nominais":
      return Prisma.sql`v.tem_nominal`;
    case "viraram-lei":
      return Prisma.sql`p."virouLei"`;
    case "aprovadas-camara":
      return Prisma.sql`(p.casa = 'CAMARA' AND NOT p."virouLei" AND p.situacao = ANY(${SITUACOES_APROVADA_CAMARA}::text[]))`;
    case "aprovadas-senado":
      return Prisma.sql`(p.casa = 'SENADO' AND NOT p."virouLei" AND v.ultima_aprovada IS TRUE)`;
    case "rejeitadas":
      return Prisma.sql`((p.casa = 'CAMARA' AND p.situacao = ${SITUACAO_ARQUIVADA} AND v.ultima_aprovada IS FALSE)
        OR (p.casa = 'SENADO' AND v.ultima_aprovada IS FALSE))`;
  }
}

interface LinhaLei {
  id: number;
  casa: CasaLegislativa;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  situacao: string | null;
  virouLei: boolean;
  normaJuridica: string | null;
  autorNome: string | null;
  autorTipo: string | null;
  autorParlamentarId: number | null;
  autorPartido: string | null;
  autorUf: string | null;
  totalAutores: number;
  votacoes: (Omit<VotacaoResumo, "data"> & { data: string })[];
}

// Votações no mesmo horário (comum no Senado) não têm ordem entre si na fonte: vale a de maior id, no banco e aqui
// (as votações chegam ordenadas assim, e a ordenação do código é estável). Assim a aba e o selo do card sempre concordam.
// As POR_ABA proposições da aba com a votação mais recente, numa única consulta (cada ida ao banco custa ~1 s
// de distância em desenvolvimento). O filtro e a ordem ficam no banco; o card segue sendo montado pelas
// funções de lib/leis.ts a partir das votações da proposição.
export async function listarLeis(aba: Aba): Promise<CardLei[]> {
  const linhas = await db.$queryRaw<LinhaLei[]>`
    WITH v AS (
      SELECT "proposicaoId" AS pid,
             max(data) AS ultima_data,
             bool_or(NOT simbolica AND NOT secreta AND "votosSim" + "votosNao" + "votosAbstencao" > 0) AS tem_nominal,
             (array_agg(aprovada ORDER BY data DESC, id DESC))[1] AS ultima_aprovada
      FROM "Votacao"
      WHERE "proposicaoId" IS NOT NULL
      GROUP BY "proposicaoId"
    ),
    sel AS (
      SELECT p.id, v.ultima_data
      FROM "Proposicao" p
      JOIN v ON v.pid = p.id
      WHERE ${condicaoDaAba(aba)}
      ORDER BY v.ultima_data DESC, p.id DESC
      LIMIT ${POR_ABA}
    )
    SELECT p.id, p.casa::text AS casa, p."siglaTipo", p.numero, p.ano, p.ementa, p.situacao, p."virouLei", p."normaJuridica",
           a.nome AS "autorNome", a.tipo AS "autorTipo", a."parlamentarId" AS "autorParlamentarId",
           pa.partido AS "autorPartido", pa.uf AS "autorUf",
           (SELECT count(*)::int FROM "Autor" WHERE "proposicaoId" = p.id) AS "totalAutores",
           (SELECT jsonb_agg(jsonb_build_object(
                     'data', to_char(vt.data, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                     'descricao', vt.descricao, 'aprovada', vt.aprovada, 'simbolica', vt.simbolica, 'secreta', vt.secreta,
                     'votosSim', vt."votosSim", 'votosNao', vt."votosNao", 'votosAbstencao', vt."votosAbstencao")
                   ORDER BY vt.data DESC, vt.id DESC)
              FROM "Votacao" vt WHERE vt."proposicaoId" = p.id) AS votacoes
    FROM sel
    JOIN "Proposicao" p ON p.id = sel.id
    LEFT JOIN LATERAL (
      SELECT nome, tipo, "parlamentarId" FROM "Autor" WHERE "proposicaoId" = p.id ORDER BY ordem ASC, id ASC LIMIT 1
    ) a ON TRUE
    LEFT JOIN "Parlamentar" pa ON pa.id = a."parlamentarId"
    ORDER BY sel.ultima_data DESC, p.id DESC`;

  return linhas.map((p) => {
    const votacoes: VotacaoResumo[] = (p.votacoes ?? []).map((x) => ({ ...x, data: new Date(x.data) }));
    const d = votacaoDestaque(votacoes);
    return {
      id: p.id,
      casa: p.casa,
      codigo: codigo(p),
      ementa: p.ementa,
      situacao: p.situacao,
      virouLei: p.virouLei,
      normaJuridica: p.normaJuridica,
      status: statusDe({ casa: p.casa, virouLei: p.virouLei, situacao: p.situacao, votacoes }),
      autoria:
        p.autorNome === null
          ? null
          : {
              texto: autoriaTexto(
                { nome: p.autorNome, tipo: p.autorTipo, partido: p.autorPartido ?? undefined, uf: p.autorUf ?? undefined },
                p.totalAutores - 1,
              ),
              parlamentarId: p.autorParlamentarId,
            },
      totalVotacoes: votacoes.length,
      destaque: d && {
        dataIso: d.data.toISOString(),
        descricao: d.descricao,
        aprovada: d.aprovada,
        estado: estadoDe(d),
        sim: d.votosSim,
        nao: d.votosNao,
        abst: d.votosAbstencao,
      },
    };
  });
}

export interface VotoLinha {
  parlamentarId: number;
  nome: string;
  uf: string;
  partido: string;
  voto: string;
}

export interface VotacaoDetalhe {
  id: number;
  dataIso: string;
  descricao: string;
  aprovada: boolean | null;
  estado: EstadoVotacao;
  sim: number;
  nao: number;
  abst: number;
  orientacoes: { partido: string; orientacao: string }[];
  votos: VotoLinha[];
}

export async function buscarLei(id: number) {
  const p = await db.proposicao.findUnique({
    where: { id },
    include: {
      autores: {
        orderBy: { ordem: "asc" },
        include: { parlamentar: { select: { id: true, nome: true } } },
      },
      votacoes: {
        orderBy: { data: "asc" },
        include: {
          orientacoes: { orderBy: { partido: "asc" } },
          votos: {
            include: { parlamentar: { select: { nome: true, uf: true } } },
          },
        },
      },
    },
  });
  if (!p) return null;

  const votacoes: VotacaoDetalhe[] = p.votacoes.map((v) => ({
    id: v.id,
    dataIso: v.data.toISOString(),
    descricao: v.descricao,
    aprovada: v.aprovada,
    estado: estadoDe(v),
    sim: v.votosSim,
    nao: v.votosNao,
    abst: v.votosAbstencao,
    orientacoes: v.orientacoes.map((o) => ({ partido: o.partido, orientacao: o.orientacao })),
    votos: v.votos
      .map((x) => ({
        parlamentarId: x.parlamentarId,
        nome: x.parlamentar.nome,
        uf: x.parlamentar.uf,
        partido: x.partido,
        voto: x.voto,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));

  return {
    proposicao: {
      id: p.id,
      casa: p.casa,
      codigo: codigo(p),
      siglaTipo: p.siglaTipo,
      ementa: p.ementa,
      situacao: p.situacao,
      virouLei: p.virouLei,
      normaJuridica: p.normaJuridica,
      urlInteiroTeor: p.urlInteiroTeor,
      dataApresentacaoIso: p.dataApresentacao ? p.dataApresentacao.toISOString() : null,
      dataLeiIso: p.dataLei ? p.dataLei.toISOString() : null,
    },
    autores: p.autores.map((a) => ({
      nome: a.nome,
      tipo: a.tipo,
      parlamentarId: a.parlamentar?.id ?? null,
    })),
    votacoes,
    // Índice da votação aberta por padrão: a mesma regra do card.
    destaqueIndice: (() => {
      const d = votacaoDestaque(p.votacoes);
      return d ? p.votacoes.indexOf(d) : 0;
    })(),
  };
}

// Presença e autorias do perfil. Os denominadores das duas casas vêm juntos para não
// serializar consultas (a casa do parlamentar só se sabe depois de carregá-lo).
export async function resumoLegislativo(parlamentarId: number, ano: number) {
  const inicio = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano + 1, 0, 1));
  const doAno = { data: { gte: inicio, lt: fim } };
  const nominaisDe = (casa: CasaLegislativa) =>
    db.votacao.count({ where: { casa, simbolica: false, secreta: false, ...doAno } });

  const [camara, senado, votou, autorias] = await Promise.all([
    nominaisDe("CAMARA"),
    nominaisDe("SENADO"),
    db.voto.count({ where: { parlamentarId, voto: { notIn: SEM_VOTO }, votacao: doAno } }),
    db.autor.count({ where: { parlamentarId } }),
  ]);
  return { nominais: { CAMARA: camara, SENADO: senado }, votou, autorias };
}
