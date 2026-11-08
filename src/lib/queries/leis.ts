import { Prisma, type TipoVoto } from "@prisma/client";
import { db } from "@/lib/db";
import {
  codigo,
  estadoDe,
  autoriaTexto,
  SITUACAO_ARQUIVADA,
  SITUACOES_APROVADA_CAMARA,
  SITUACOES_ENCERRADAS,
  statusDe,
  votacaoDestaque,
  type Aba,
  type CasaLegislativa,
  type EstadoVotacao,
  type VotacaoResumo,
} from "@/lib/leis";
import { termosDaBusca } from "@/lib/leis-api";
import { ehCreditoExtraordinario } from "@/lib/sources/camara/adapter";

export const POR_ABA = 100;

// Ausente e "presente, sem voto" (Senado) não contam como ter votado na presença.
export const SEM_VOTO: TipoVoto[] = ["AUSENTE", "PRESENTE_SEM_VOTO"];

export interface OutraCasa {
  id: number;
  casa: CasaLegislativa;
  codigo: string;
}

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
  // Só em "Viraram lei": a mesma norma também tem registro na outra casa (um card por lei, não por casa).
  tambem: OutraCasa[];
  // Só medida provisória: prazo no Congresso e data em que chegou.
  mp: { vigenciaFimIso: string | null; prorrogada: boolean; apresentadaIso: string | null; creditoExtraordinario: boolean } | null;
  // Só PEC em andamento: onde está agora e quando teve a última movimentação (status oficial da Câmara).
  pec: { orgaoAtual: string | null; ultimaMovimentacaoIso: string | null } | null;
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
    case "medidas-provisorias":
      return Prisma.sql`p."siglaTipo" = 'MPV'`;
    case "pecs":
      return Prisma.sql`(p.casa = 'CAMARA' AND p."siglaTipo" = 'PEC' AND p.situacao IS NOT NULL
        AND btrim(p.situacao) <> ALL(${SITUACOES_ENCERRADAS}::text[]))`;
    case "aprovadas-camara":
      return Prisma.sql`(p.casa = 'CAMARA' AND NOT p."virouLei" AND p.situacao = ANY(${SITUACOES_APROVADA_CAMARA}::text[]))`;
    case "aprovadas-senado":
      return Prisma.sql`(p.casa = 'SENADO' AND NOT p."virouLei" AND v.ultima_aprovada IS TRUE)`;
    case "rejeitadas":
      return Prisma.sql`((p.casa = 'CAMARA' AND p.situacao = ${SITUACAO_ARQUIVADA} AND v.ultima_aprovada IS FALSE)
        OR (p.casa = 'SENADO' AND v.ultima_aprovada IS FALSE))`;
  }
}

// Em "Viraram lei" os registros que viraram A MESMA norma (um da Câmara, um do Senado) formam um grupo e saem num card
// só. O Senado escreve "Lei 14597/2023" e a Câmara "Lei Ordinária 14597/2023": é a mesma lei, então normaliza.
// Nas outras abas não há um identificador seguro que ligue o mesmo projeto nas duas casas: cada registro é um grupo.
// Em "Medidas provisórias" o mesmo número de MPV na Câmara e no Senado é a mesma MP: um card só (o da Câmara, que tem a vigência).
function chaveDoGrupo(aba: Aba): Prisma.Sql {
  if (aba === "medidas-provisorias") return Prisma.sql`'MPV ' || p.numero::text || '/' || p.ano::text`;
  return aba === "viraram-lei"
    ? Prisma.sql`COALESCE(regexp_replace(p."normaJuridica", '^Lei Ordinária', 'Lei'), 'id:' || p.id::text)`
    : Prisma.sql`p.id::text`;
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
  total: number;
  anos: number[];
  vigenciaFim: Date | null;
  prorrogada: boolean;
  orgaoAtual: string | null;
  dataUltimaTramitacao: Date | null;
  dataApresentacao: Date | null;
  tambem: OutraCasa[] | null;
  votacoes: (Omit<VotacaoResumo, "data"> & { data: string })[];
}

export interface OpcoesLeis {
  offset?: number;
  limite?: number;
  ano?: number | null; // só as cuja votação mostrada no card (a nominal mais recente) foi nesse ano
  busca?: string | null; // texto digitado: cada palavra tem de aparecer no código, na norma, na ementa ou nos autores
  autor?: number | null; // id do parlamentar: só proposições em que ele consta como autor (junto com a busca, as duas valem)
}

// Mesma normalização de lib/leis-api.ts (normalizarBusca), feita no banco: sem acento, minúscula, sem ponto de milhar.
// A lista cobre todo caractere acentuado que existe nos textos (conferido no banco: o resto é º, §, aspas etc.).
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";
const normalizadoNoBanco = (texto: Prisma.Sql) =>
  Prisma.sql`replace(lower(translate(${texto}, ${COM_ACENTO + COM_ACENTO.toUpperCase()}, ${SEM_ACENTO + SEM_ACENTO})), '.', '')`;

// Texto em que a busca procura: código ("PL 2418/2026" e "PL2418/2026"), norma, ementa e autores (nome, partido e UF).
const TEXTO_DA_PROPOSICAO = Prisma.sql`p."siglaTipo" || ' ' || p.numero || '/' || p.ano || ' ' || p."siglaTipo" || p.numero || '/' || p.ano
  || ' ' || COALESCE(p."normaJuridica", '') || ' ' || p.ementa || ' ' || COALESCE(au.texto, '')`;

const JUNTA_AUTORES = Prisma.sql`LEFT JOIN LATERAL (
  SELECT string_agg(a.nome || ' ' || COALESCE(pa.partido, '') || ' ' || COALESCE(pa.uf, ''), ' ') AS texto
  FROM "Autor" a LEFT JOIN "Parlamentar" pa ON pa.id = a."parlamentarId"
  WHERE a."proposicaoId" = p.id
) au ON TRUE`;

export interface PaginaLeis {
  cards: CardLei[];
  total: number; // quantas existem na aba (e no ano, se filtrado), e não só nesta página
  anos: number[]; // anos das votações mostradas nos cards da aba, do mais recente para o mais antigo (alimenta o filtro)
}

// Uma página de proposições da aba, da votação mais recente para a mais antiga, numa única consulta (cada ida ao banco
// custa ~1 s de distância em desenvolvimento). O filtro, o agrupamento, o ano, a ordem e a página ficam no banco; o
// card segue sendo montado pelas funções de lib/leis.ts a partir das votações da proposição.
//
// Votações no mesmo horário (comum no Senado) não têm ordem entre si na fonte: vale a de maior id, no banco e aqui
// (as votações chegam ordenadas assim, e a ordenação do código é estável). Assim a aba e o selo do card sempre concordam.
export async function listarLeis(aba: Aba, { offset = 0, limite = POR_ABA, ano = null, busca = null, autor = null }: OpcoesLeis = {}): Promise<PaginaLeis> {
  // Busca: o registro "casa" se TODAS as palavras aparecem no texto dele. Em "Viraram lei" o grupo (Câmara + Senado da
  // mesma norma) aparece se QUALQUER registro dele casar, e o card mostra o grupo inteiro.
  const termos = busca ? termosDaBusca(busca) : [];
  const casouTexto =
    termos.length === 0
      ? Prisma.sql`TRUE`
      : Prisma.sql`(${Prisma.join(termos.map((t) => Prisma.sql`strpos(${normalizadoNoBanco(TEXTO_DA_PROPOSICAO)}, ${t}) > 0`), " AND ")})`;
  // Autor: o registro casa se o parlamentar consta entre os autores dele. Em "Viraram lei" vale o mesmo critério do
  // texto: o card aparece se QUALQUER registro do grupo (Câmara ou Senado) casar com TUDO o que foi pedido.
  const casouAutor =
    autor === null
      ? Prisma.sql`TRUE`
      : Prisma.sql`EXISTS (SELECT 1 FROM "Autor" fa WHERE fa."proposicaoId" = p.id AND fa."parlamentarId" = ${autor}::int)`;
  const casou = Prisma.sql`(${casouTexto} AND ${casouAutor})`;
  const juntaAutores = termos.length === 0 ? Prisma.empty : JUNTA_AUTORES;
  const filtroAno = ano === null ? Prisma.sql`TRUE` : Prisma.sql`extract(year FROM destaque_data)::int = ${ano}::int`;
  const ehMp = aba === "medidas-provisorias";
  const ehPec = aba === "pecs";
  // Medida provisória e PEC podem nunca ter ido a plenário: sem votação, vale a data de apresentação (MPV) ou a da
  // última movimentação (PEC, que fica parada anos e volta: a que andou há pouco vem primeiro).
  const juntaVotos = ehMp || ehPec ? Prisma.sql`LEFT JOIN v ON v.pid = p.id` : Prisma.sql`JOIN v ON v.pid = p.id`;
  const dataOrdem = ehMp
    ? Prisma.sql`COALESCE(p."dataApresentacao"::timestamp, v.ultima_data)`
    : ehPec
      ? Prisma.sql`COALESCE(p."dataUltimaTramitacao"::timestamp, v.ultima_data, p."dataApresentacao"::timestamp)`
      : Prisma.sql`v.ultima_data`;
  const dataDestaque = ehMp
    ? Prisma.sql`COALESCE(p."dataApresentacao"::timestamp, v.destaque_data)`
    : ehPec
      ? Prisma.sql`COALESCE(p."dataUltimaTramitacao"::timestamp, v.destaque_data, p."dataApresentacao"::timestamp)`
      : Prisma.sql`v.destaque_data`;
  const preferirCamara = ehMp ? Prisma.sql`(casa = 'CAMARA') DESC,` : Prisma.empty;
  const linhas = await db.$queryRaw<LinhaLei[]>`
    WITH v AS (
      SELECT "proposicaoId" AS pid,
             max(data) AS ultima_data,
             -- data da votação que o card mostra (lib/leis.ts votacaoDestaque): a mais recente com placar nominal, senão a mais recente
             COALESCE(max(data) FILTER (WHERE NOT simbolica AND NOT secreta), max(data)) AS destaque_data,
             bool_or(NOT simbolica AND NOT secreta AND "votosSim" + "votosNao" + "votosAbstencao" > 0) AS tem_nominal,
             (array_agg(aprovada ORDER BY data DESC, id DESC))[1] AS ultima_aprovada
      FROM "Votacao"
      WHERE "proposicaoId" IS NOT NULL
      GROUP BY "proposicaoId"
    ),
    cand AS (
      SELECT p.id, p.casa::text AS casa, ${dataOrdem} AS ultima_data, ${dataDestaque} AS destaque_data,
             ${chaveDoGrupo(aba)} AS grupo, ${casou} AS casou
      FROM "Proposicao" p
      ${juntaVotos}
      ${juntaAutores}
      WHERE ${condicaoDaAba(aba)}
    ),
    marcadas AS (
      SELECT *, bool_or(casou) OVER (PARTITION BY grupo) AS grupo_casou FROM cand
    ),
    primarias AS (
      SELECT DISTINCT ON (grupo) id, ultima_data, destaque_data, grupo, grupo_casou
      FROM marcadas
      ORDER BY grupo, ${preferirCamara} ultima_data DESC, id DESC
    ),
    sel AS (
      SELECT id, ultima_data, grupo,
             count(*) OVER ()::int AS total,
             (SELECT array_agg(DISTINCT extract(year FROM destaque_data)::int) FROM primarias) AS anos
      FROM primarias
      WHERE grupo_casou AND ${filtroAno}
      ORDER BY ultima_data DESC, id DESC
      LIMIT ${limite} OFFSET ${offset}
    )
    SELECT p.id, p.casa::text AS casa, p."siglaTipo", p.numero, p.ano, p.ementa, p.situacao, p."virouLei", p."normaJuridica",
           p."vigenciaFim", p."prorrogada", p."dataApresentacao", p."orgaoAtual", p."dataUltimaTramitacao",
           a.nome AS "autorNome", a.tipo AS "autorTipo", a."parlamentarId" AS "autorParlamentarId",
           pa.partido AS "autorPartido", pa.uf AS "autorUf",
           (SELECT count(*)::int FROM "Autor" WHERE "proposicaoId" = p.id) AS "totalAutores",
           sel.total, sel.anos,
           (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'casa', o.casa::text, 'codigo', o."siglaTipo" || ' ' || o.numero || '/' || o.ano)
                             ORDER BY c.ultima_data DESC, o.id DESC)
              FROM cand c JOIN "Proposicao" o ON o.id = c.id
             WHERE c.grupo = sel.grupo AND c.id <> sel.id) AS tambem,
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

  const cards = linhas.map((p) => {
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
      status: statusDe({
        casa: p.casa,
        virouLei: p.virouLei,
        situacao: p.situacao,
        votacoes,
        siglaTipo: p.siglaTipo,
        vigenciaFim: p.vigenciaFim,
      }),
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
      tambem: p.tambem ?? [],
      mp:
        p.siglaTipo === "MPV"
          ? {
              vigenciaFimIso: p.vigenciaFim ? p.vigenciaFim.toISOString() : null,
              prorrogada: p.prorrogada,
              apresentadaIso: p.dataApresentacao ? p.dataApresentacao.toISOString() : null,
              creditoExtraordinario: ehCreditoExtraordinario(p.ementa),
            }
          : null,
      pec:
        aba === "pecs"
          ? {
              orgaoAtual: p.orgaoAtual,
              ultimaMovimentacaoIso: p.dataUltimaTramitacao ? p.dataUltimaTramitacao.toISOString() : null,
            }
          : null,
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
  const anos = [...(linhas[0]?.anos ?? [])].sort((x, y) => y - x);
  return { cards, total: linhas[0]?.total ?? 0, anos };
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
      orgaoAtual: p.orgaoAtual,
      ultimaMovimentacaoIso: p.dataUltimaTramitacao ? p.dataUltimaTramitacao.toISOString() : null,
      idOrigem: p.idOrigem,
      dataLeiIso: p.dataLei ? p.dataLei.toISOString() : null,
      vigenciaFimIso: p.vigenciaFim ? p.vigenciaFim.toISOString() : null,
      prorrogada: p.prorrogada,
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
    db.autor.count({ where: { parlamentarId, proposicao: { votacoes: { some: {} } } } }),
  ]);
  return { nominais: { CAMARA: camara, SENADO: senado }, votou, autorias };
}

export interface AutorDeLei {
  id: number;
  nome: string;
  partido: string;
  uf: string;
  casa: "CAMARA" | "SENADO";
}

// Parlamentares que constam como autores de alguma proposição que aparece em Leis (tem votação, ou é PEC em andamento). Alimenta o filtro por
// autor da tela. Autoria de órgão (comissão, Executivo) não entra: não é parlamentar. Pode incluir quem já saiu do cargo.
export async function listarAutoresDeLeis(): Promise<AutorDeLei[]> {
  return db.$queryRaw<AutorDeLei[]>`
    SELECT pa.id, pa.nome, pa.partido, pa.uf::text AS uf, pa.casa::text AS casa
    FROM "Parlamentar" pa
    WHERE EXISTS (
      SELECT 1 FROM "Autor" a JOIN "Proposicao" p ON p.id = a."proposicaoId"
      WHERE a."parlamentarId" = pa.id
        AND (EXISTS (SELECT 1 FROM "Votacao" v WHERE v."proposicaoId" = p.id)
             OR (p.casa = 'CAMARA' AND p."siglaTipo" = 'PEC' AND p.situacao IS NOT NULL
                 AND btrim(p.situacao) <> ALL(${SITUACOES_ENCERRADAS}::text[])))
    )
    ORDER BY pa.nome ASC, pa.id ASC`;
}
