import { fetchWithRetry } from "../../http";
import { despesasSchema, entesSchema, rreoSchema, type LinhaDespesa, type LinhaRreo } from "./schemas";

const BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";

async function getJson(url: string): Promise<unknown> {
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  return res.json();
}

export interface Estado {
  codIbge: number;
  nome: string;
}

// 26 estados (esfera E) + Distrito Federal (esfera D). O filtro `esfera` da API é ignorado, então filtramos aqui.
export async function listarEstados(): Promise<Estado[]> {
  const r = entesSchema.parse(await getJson(`${BASE}/entes`));
  if (r.hasMore) throw new Error("lista de entes paginada: o cliente não segue páginas");
  return r.items
    .filter((e) => e.esfera === "E" || e.esfera === "D")
    .map((e) => ({ codIbge: e.cod_ibge, nome: e.ente }))
    .sort((a, b) => a.codIbge - b.codIbge);
}

// RREO-Anexo 01 (balanço orçamentário) de um ente num bimestre. Vazio = ainda não publicado.
export async function buscarRreo(ano: number, bimestre: number, codIbge: number): Promise<LinhaRreo[]> {
  const params = new URLSearchParams({
    an_exercicio: String(ano),
    nr_periodo: String(bimestre),
    co_tipo_demonstrativo: "RREO",
    no_anexo: "RREO-Anexo 01",
    id_ente: String(codIbge),
  });
  const r = rreoSchema.parse(await getJson(`${BASE}/rreo?${params}`));
  if (r.hasMore) throw new Error(`RREO de ${codIbge} paginado: o cliente não segue páginas`);
  return r.items;
}

const COD_IBGE_UNIAO = 1;

// RREO-Anexo 02 (despesa por função e subfunção) da União. Vazio = bimestre ainda não publicado.
export async function buscarDespesasUniao(ano: number, bimestre: number): Promise<LinhaDespesa[]> {
  const params = new URLSearchParams({
    an_exercicio: String(ano),
    nr_periodo: String(bimestre),
    co_tipo_demonstrativo: "RREO",
    no_anexo: "RREO-Anexo 02",
    id_ente: String(COD_IBGE_UNIAO),
  });
  const r = despesasSchema.parse(await getJson(`${BASE}/rreo?${params}`));
  if (r.hasMore) throw new Error("RREO-Anexo 02 paginado: o cliente não segue páginas");
  return r.items;
}
