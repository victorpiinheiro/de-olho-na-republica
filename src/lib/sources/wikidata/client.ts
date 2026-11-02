import type { z } from "zod";
import { fetchWithRetry } from "../../http";
import { commonsSchema, type CommonsResposta } from "./commons";
import { fotosSchema, mandatosSchema, partidosSchema, type FotoRow, type MandatoRow, type PartidoRow } from "./schemas";

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

// Foto principal (P18). O Wikidata devolve só o rótulo "melhor" da propriedade: uma imagem por pessoa.
const SPARQL_FOTOS = `
SELECT DISTINCT ?item ?foto WHERE {
  ?item wdt:P31 ${HUMANO} .
  ?item wdt:P39 ${PRESIDENTE_DO_BRASIL} .
  ?item wdt:P18 ?foto .
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

export async function buscarFotos(): Promise<FotoRow[]> {
  return (await consultar(SPARQL_FOTOS, fotosSchema)).results.bindings;
}

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const LOTE_COMMONS = 50; // limite da API por consulta com `titles`

// Autor, licença e miniatura de 480 px de cada arquivo do Wikimedia Commons.
export async function buscarMetadadosCommons(arquivos: string[]): Promise<CommonsResposta[]> {
  const respostas: CommonsResposta[] = [];
  for (let i = 0; i < arquivos.length; i += LOTE_COMMONS) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "imageinfo",
      iiprop: "extmetadata|url",
      iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|AttributionRequired|Restrictions",
      iiurlwidth: "480",
      titles: arquivos.slice(i, i + LOTE_COMMONS).map((a) => `File:${a}`).join("|"),
    });
    const res = await fetchWithRetry(`${COMMONS_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    respostas.push(commonsSchema.parse(await res.json()));
  }
  return respostas;
}
