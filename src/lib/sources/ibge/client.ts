import { z } from "zod";
import { fetchWithRetry } from "../../http";

// SIDRA, tabela 6579 (estimativas de população), variável 9324, nível N1 (Brasil). Formato confirmado:
// [{ resultados: [{ series: [{ serie: { "2026": "214211951" } }] }] }]
const URL =
  "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N1%5Ball%5D";

export const populacaoSchema = z
  .array(
    z.object({
      resultados: z
        .array(z.object({ series: z.array(z.object({ serie: z.record(z.string().regex(/^\d{4}$/), z.string().regex(/^\d+$/)) })).length(1) }))
        .length(1),
    }),
  )
  .length(1);

export function toPopulacao(bruto: unknown): { ano: number; pessoas: number } {
  const [serie] = Object.entries(populacaoSchema.parse(bruto)[0].resultados[0].series[0].serie);
  if (!serie) throw new Error("série de população vazia");
  return { ano: Number(serie[0]), pessoas: Number(serie[1]) };
}

export async function buscarPopulacaoBrasil() {
  // Poucas tentativas: o job mensal segue com a última população guardada se o IBGE não responder (ver sync-arrecadacao).
  const res = await fetchWithRetry(URL, {}, { retries: 2 });
  return toPopulacao(await res.json());
}
