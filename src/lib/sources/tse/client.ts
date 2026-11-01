import { fetchWithRetry } from "../../http";
import { catalogoSchema, resultadoSchema, type ResultadoApi } from "./schemas";

const BASE = process.env.TSE_BASE_URL ?? "https://resultados.tse.jus.br/oficial";
const CICLO = "ele2026";

// Código do cargo no catálogo do TSE.
export const CARGO_TSE = { PRESIDENTE: "1", GOVERNADOR: "3" } as const;
export type CargoTse = (typeof CARGO_TSE)[keyof typeof CARGO_TSE];

export interface CodigosEleicao {
  turno1: string;
  turno2: string;
}

// Os códigos de eleição mudam a cada ciclo e o 2º turno tem código próprio (`cdt2`): descobre pelo catálogo.
export async function descobrirEleicao(cargo: CargoTse): Promise<CodigosEleicao> {
  const res = await fetchWithRetry(`${BASE}/comum/config/ele-c.json`);
  const catalogo = catalogoSchema.parse(await res.json());
  const eleicao = catalogo.pl
    .filter((p) => p.c === CICLO)
    .flatMap((p) => p.e)
    .find((e) => e.t === "1" && e.abr.some((a) => a.cp.some((c) => c.cd === cargo)));
  if (!eleicao?.cdt2) throw new Error(`catálogo do TSE sem eleição de 2 turnos para o cargo ${cargo}`);
  return { turno1: eleicao.cd, turno2: eleicao.cdt2 };
}

// `uf` em minúsculas, ou "br" para o Brasil.
export async function buscarResultado(
  codigoEleicao: string,
  cargo: CargoTse,
  uf: string,
): Promise<ResultadoApi> {
  const u = uf.toLowerCase();
  const arquivo = `${u}-c${cargo.padStart(4, "0")}-e${codigoEleicao.padStart(6, "0")}-u.json`;
  const res = await fetchWithRetry(`${BASE}/${CICLO}/${codigoEleicao}/dados/${u}/${arquivo}`);
  return resultadoSchema.parse(await res.json());
}
