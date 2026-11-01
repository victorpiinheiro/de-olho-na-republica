import { z } from "zod";

// A Receita só publica a arrecadação mensal em PDF (relatório "Análise da Arrecadação das Receitas
// Federais"). As Tabelas III e III-A trazem a série mensal por categoria, em R$ milhões, com
// ponto de milhar e negativo entre parênteses. Formato confirmado no relatório de set/2026.

export const milhoesBr = z
  .string()
  .regex(/^\(?\d{1,3}(\.\d{3})*\)?$/)
  .transform((s) => {
    const n = Number(s.replace(/[().]/g, ""));
    return s.startsWith("(") ? -n : n;
  });

// IR, IPI, Importação e IPI-vinculado, Contribuições, Previdenciária, Outros, Total RFB, Outros órgãos, Total geral.
export const COLUNAS = 9;

export const linhaMesSchema = z.object({
  mes: z.enum(["JAN", "FEV", "MAR", "ABR", "MAIO", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]),
  valores: z.array(milhoesBr).length(COLUNAS),
});
export type LinhaMes = z.infer<typeof linhaMesSchema>;
