import { z } from "zod";
import { fetchWithRetry } from "../../http";
import {
  despesaCeapsSchema,
  listaSenadoresSchema,
  materiaSchema,
  processoSchema,
  votacaoSenadoSchema,
  type DespesaCeapsApi,
  type SenadorApi,
} from "./schemas";

const BASE = "https://legis.senado.leg.br/dadosabertos";
const JSON_HEADERS = { Accept: "application/json" };

async function getJson(url: string): Promise<unknown> {
  const res = await fetchWithRetry(url, { headers: JSON_HEADERS });
  return res.json();
}

async function listarSenadoresDe(caminho: string): Promise<SenadorApi[]> {
  const raiz = listaSenadoresSchema.parse(await getJson(`${BASE}${caminho}`));
  const lista = Object.values(raiz)[0];
  if (!lista) throw new Error(`resposta sem lista de senadores em ${caminho}`);
  return lista.Parlamentares.Parlamentar;
}

export const listarSenadoresEmExercicio = () => listarSenadoresDe("/senador/lista/atual");
export const listarSenadoresDaLegislatura = (n: number) =>
  listarSenadoresDe(`/senador/lista/legislatura/${n}`);

export interface LinhaCeapsInvalida {
  indice: number;
  erro: string;
}

// Valida linha a linha: um registro estranho não derruba o ano inteiro, mas o job aborta
// se a fração de inválidas passar do limite (sinal de que o formato mudou).
export async function listarDespesasCeaps(url: string) {
  const bruto = z.array(z.unknown()).parse(await getJson(url));
  const validas: DespesaCeapsApi[] = [];
  const invalidas: LinhaCeapsInvalida[] = [];
  bruto.forEach((linha, indice) => {
    const r = despesaCeapsSchema.safeParse(linha);
    if (r.success) validas.push(r.data);
    else invalidas.push({ indice, erro: r.error.issues[0]?.message ?? "inválida" });
  });
  return { validas, invalidas };
}

// Datas em YYYY-MM-DD (o formato YYYYMMDD é rejeitado pelo endpoint novo).
export async function listarVotacoesSenado(dataInicio: string, dataFim: string) {
  const bruto = z
    .array(z.unknown())
    .parse(await getJson(`${BASE}/votacao?dataInicio=${dataInicio}&dataFim=${dataFim}`));
  return bruto.map((v) => votacaoSenadoSchema.parse(v));
}

export const buscarProcesso = async (id: number) =>
  processoSchema.parse(await getJson(`${BASE}/processo/${id}`));

export const buscarMateria = async (codigo: number) =>
  materiaSchema.parse(await getJson(`${BASE}/materia/${codigo}`));
