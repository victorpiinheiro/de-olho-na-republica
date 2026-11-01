import type { TipoVoto } from "@prisma/client";
import { db } from "@/lib/db";
import {
  codigo,
  estadoDe,
  autoriaTexto,
  pertenceAba,
  statusDe,
  ultimaVotacao,
  votacaoDestaque,
  type Aba,
  type CasaLegislativa,
  type EstadoVotacao,
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

// Ordena pela votação mais recente de cada proposição e devolve as POR_ABA primeiras da aba.
export async function listarLeis(aba: Aba): Promise<CardLei[]> {
  const proposicoes = await db.proposicao.findMany({
    where: { votacoes: { some: {} } },
    include: {
      autores: {
        orderBy: { ordem: "asc" },
        take: 1,
        include: { parlamentar: { select: { partido: true, uf: true } } },
      },
      _count: { select: { autores: true } },
      votacoes: {
        select: {
          data: true,
          descricao: true,
          aprovada: true,
          simbolica: true,
          secreta: true,
          votosSim: true,
          votosNao: true,
          votosAbstencao: true,
        },
      },
    },
  });

  return proposicoes
    .filter((p) => pertenceAba(p, aba))
    .sort(
      (a, b) =>
        (ultimaVotacao(b.votacoes)?.data.getTime() ?? 0) -
        (ultimaVotacao(a.votacoes)?.data.getTime() ?? 0),
    )
    .slice(0, POR_ABA)
    .map((p) => {
      const d = votacaoDestaque(p.votacoes);
      return {
        id: p.id,
        casa: p.casa,
        codigo: codigo(p),
        ementa: p.ementa,
        situacao: p.situacao,
        virouLei: p.virouLei,
        normaJuridica: p.normaJuridica,
        status: statusDe(p),
        autoria: p.autores[0]
          ? {
              texto: autoriaTexto(
                {
                  nome: p.autores[0].nome,
                  tipo: p.autores[0].tipo,
                  partido: p.autores[0].parlamentar?.partido,
                  uf: p.autores[0].parlamentar?.uf,
                },
                p._count.autores - 1,
              ),
              parlamentarId: p.autores[0].parlamentarId,
            }
          : null,
        totalVotacoes: p.votacoes.length,
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
