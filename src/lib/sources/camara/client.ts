import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { unzipSync } from "fflate";
import { fetchAllPages, fetchBytes, fetchOne } from "../../http";
import {
  autorSchema,
  COLUNAS_DESPESA_CSV,
  deputadoSchema,
  despesaCsvSchema,
  orientacaoSchema,
  proposicaoListaSchema,
  proposicaoSchema,
  tramitacaoSchema,
  votacaoListaSchema,
  votacaoSchema,
  votoSchema,
  type DespesaCsv,
} from "./schemas";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

// Sem idLegislatura: só os deputados em exercício. Com ele: todos que passaram pela legislatura
// (a mesma pessoa pode vir repetida, uma linha por mudança de partido).
export function listarDeputados(idLegislatura?: number) {
  const filtro = idLegislatura ? `idLegislatura=${idLegislatura}&` : "";
  return fetchAllPages(
    `${BASE}/deputados?${filtro}itens=100&ordem=ASC&ordenarPor=nome`,
    deputadoSchema,
  );
}

const ID_ORGAO_PLENARIO = 180;

// Datas em YYYY-MM-DD. A API rejeita siglaOrgao; o filtro certo é idOrgao.
export function listarVotacoesPlenario(dataInicio: string, dataFim: string) {
  return fetchAllPages(
    `${BASE}/votacoes?dataInicio=${dataInicio}&dataFim=${dataFim}&idOrgao=${ID_ORGAO_PLENARIO}` +
      "&itens=100&ordem=ASC&ordenarPor=dataHoraRegistro",
    votacaoListaSchema,
  );
}

export const buscarVotacao = (id: string) => fetchOne(`${BASE}/votacoes/${id}`, votacaoSchema);

// /votos não aceita `itens`.
export const listarVotos = (id: string) => fetchAllPages(`${BASE}/votacoes/${id}/votos`, votoSchema);

export const listarOrientacoes = (id: string) =>
  fetchAllPages(`${BASE}/votacoes/${id}/orientacoes`, orientacaoSchema);

export const buscarProposicao = (id: number) => fetchOne(`${BASE}/proposicoes/${id}`, proposicaoSchema);

// Todas as medidas provisórias apresentadas no ano.
export const listarMedidasProvisorias = (ano: number) =>
  fetchAllPages(`${BASE}/proposicoes?siglaTipo=MPV&ano=${ano}&itens=100&ordem=ASC&ordenarPor=id`, proposicaoListaSchema);

export const listarAutores = (id: number) =>
  fetchAllPages(`${BASE}/proposicoes/${id}/autores`, autorSchema);

export const listarTramitacoes = (id: number) =>
  fetchAllPages(`${BASE}/proposicoes/${id}/tramitacoes`, tramitacaoSchema);

export interface LinhaInvalida {
  linha: number;
  erro: string;
}

// Baixa o zip anual e entrega as linhas já validadas, uma a uma (sem montar tudo em memória).
export async function* lerDespesasCsv(
  url: string,
  invalidas: LinhaInvalida[],
): AsyncGenerator<DespesaCsv> {
  const zip = unzipSync(await fetchBytes(url), { filter: (f) => f.name.endsWith(".csv") });
  const csv = Object.values(zip)[0];
  if (!csv) throw new Error(`zip sem CSV em ${url}`);

  const parser = Readable.from([Buffer.from(csv)]).pipe(
    parse({
      delimiter: ";",
      bom: true,
      relax_quotes: true,
      skip_empty_lines: true,
      columns: (cabecalho: string[]) => {
        const faltando = COLUNAS_DESPESA_CSV.filter((c) => !cabecalho.includes(c));
        if (faltando.length) throw new Error(`CSV sem as colunas: ${faltando.join(", ")}`);
        return cabecalho;
      },
    }),
  );

  let linha = 1;
  for await (const registro of parser) {
    linha++;
    const r = despesaCsvSchema.safeParse(registro);
    if (r.success) yield r.data;
    else invalidas.push({ linha, erro: r.error.issues[0]?.message ?? "inválida" });
  }
}
