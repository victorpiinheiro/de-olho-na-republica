import type { z } from "zod";
import { fetchWithRetry } from "../../http";
import { mandatosSchema, partidosSchema, type MandatoRow, type PartidoRow } from "./schemas";

const ENDPOINT = "https://query.wikidata.org/sparql";
// O Wikidata exige um User-Agent que identifique o projeto.
const USER_AGENT = "DeOlhoNaRepublica/0.1 (projeto de transparencia politica)";

const PRESIDENTE_DO_BRASIL = "wd:Q5176750"; // cargo (P39)
const HUMANO = "wd:Q5"; // instância de (P31): descarta eleições e juntas

// Mandatos de pessoas no cargo, com início obrigatório (o item de ruído da eleição de 1998 não tem).
const SPARQL_MANDATOS = `
SELECT ?item ?itemLabel ?inicio ?fim WHERE {
  ?item wdt:P31 ${HUMANO} .
  ?item p:P39 ?st . ?st ps:P39 ${PRESIDENTE_DO_BRASIL} .
  ?st pq:P580 ?inicio .
  OPTIONAL { ?st pq:P582 ?fim }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
} ORDER BY ?inicio`;

const SPARQL_PARTIDOS = `
SELECT DISTINCT ?item ?partidoLabel WHERE {
  ?item wdt:P31 ${HUMANO} .
  ?item wdt:P39 ${PRESIDENTE_DO_BRASIL} .
  ?item wdt:P102 ?partido .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}`;

async function consultar<T extends z.ZodType>(sparql: string, schema: T): Promise<z.infer<T>> {
  const url = `${ENDPOINT}?${new URLSearchParams({ query: sparql })}`;
  const res = await fetchWithRetry(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT } });
  return schema.parse(await res.json());
}

export async function buscarMandatos(): Promise<MandatoRow[]> {
  return (await consultar(SPARQL_MANDATOS, mandatosSchema)).results.bindings;
}

export async function buscarPartidos(): Promise<PartidoRow[]> {
  return (await consultar(SPARQL_PARTIDOS, partidosSchema)).results.bindings;
}
