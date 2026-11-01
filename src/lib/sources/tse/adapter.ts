import type { ResultadoApi } from "./schemas";

export const ANO = 2026;

export interface EleicaoNossa {
  ano: number;
  turno: number;
  cargo: string;
  uf: string;
  codigoTse: string;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  votosBrancos: number;
  votosNulos: number;
  votosValidos: number;
}

export interface CandidatoNosso {
  numero: number;
  nome: string;
  partido: string;
  votos: number;
  percentual: number;
  eleito: boolean;
}

const candidatosDe = (r: ResultadoApi) =>
  r.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ ...c, partido: p.sg }))));

// No 1º turno os finalistas vêm com st "2º turno": isso NÃO é estar eleito.
export const foiEleito = (situacao: string) => /^Eleito/.test(situacao);

// Cargo sem candidato com st "2º turno" não teve (nem terá) 2º turno naquela UF.
export const temSegundoTurno = (r: ResultadoApi) =>
  candidatosDe(r).some((c) => c.st === "2º turno");

export function toEleicao(r: ResultadoApi): { eleicao: EleicaoNossa; candidatos: CandidatoNosso[] } {
  const candidatos = candidatosDe(r).map((c) => ({
    numero: c.n,
    nome: c.nmu,
    partido: c.partido,
    votos: c.vap,
    percentual: Math.round(c.pvapn * 1000) / 1000,
    eleito: foiEleito(c.st),
  }));

  // Estas duas checagens pegam mudança de formato que ainda passa no Zod (campo trocado de sentido).
  if (new Set(candidatos.map((c) => c.numero)).size !== candidatos.length) {
    throw new Error(`candidatos com número repetido em ${r.carg[0].nmn} ${r.cdabr} ${r.t}º turno`);
  }
  const somaVotos = candidatos.reduce((s, c) => s + c.votos, 0);
  if (somaVotos !== r.v.vvc) {
    throw new Error(
      `votos dos candidatos (${somaVotos}) diferem dos votos válidos (${r.v.vvc}) em ${r.carg[0].nmn} ${r.cdabr} ${r.t}º turno`,
    );
  }

  return {
    eleicao: {
      ano: ANO,
      turno: r.t,
      cargo: r.carg[0].nmn,
      uf: r.cdabr.toUpperCase(),
      codigoTse: r.ele,
      aptos: r.e.te,
      comparecimento: r.e.c,
      abstencoes: r.e.a,
      votosBrancos: r.v.vb,
      votosNulos: r.v.tvn,
      votosValidos: r.v.vvc,
    },
    candidatos,
  };
}
