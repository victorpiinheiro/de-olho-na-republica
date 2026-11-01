import { z } from "zod";

// Ente da Federação (GET /entes). Só os campos que usamos: se um sumir, a validação quebra.
export const enteSchema = z.object({
  cod_ibge: z.number().int(),
  ente: z.string(),
  esfera: z.string(), // M = município, E = estado, D = Distrito Federal, U = União
});

export const entesSchema = z.object({
  items: z.array(enteSchema),
  hasMore: z.boolean(),
});

// Linha do RREO-Anexo 01 (GET /rreo): uma conta numa coluna do demonstrativo.
export const linhaRreoSchema = z.object({
  exercicio: z.number().int(),
  periodo: z.number().int(),
  cod_ibge: z.number().int(),
  uf: z.string(),
  rotulo: z.string(),
  coluna: z.string(),
  cod_conta: z.string(),
  valor: z.number().nullable(),
});
export type LinhaRreo = z.infer<typeof linhaRreoSchema>;

export const rreoSchema = z.object({
  items: z.array(linhaRreoSchema),
  hasMore: z.boolean(),
});
