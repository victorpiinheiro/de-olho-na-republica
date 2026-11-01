import { z } from "zod";

// Formatos confirmados na API real do TSE (resultados.tse.jus.br). Extras são ignorados;
// campo ausente ou fora do formato quebra a validação (nunca grava dado errado).
// Todos os números chegam como string, e os percentuais "n" usam vírgula decimal.

const inteiro = z
  .string()
  .regex(/^\d+$/)
  .transform((s) => Number(s));

const decimal = z
  .string()
  .regex(/^\d+([.,]\d+)?$/)
  .transform((s) => Number(s.replace(",", ".")));

// GET /oficial/comum/config/ele-c.json: um pleito por ciclo; cada eleição aponta o 2º turno em `cdt2`.
export const catalogoSchema = z.object({
  pl: z.array(
    z.object({
      c: z.string(),
      e: z.array(
        z.object({
          cd: z.string(),
          cdt2: z.string().optional(),
          t: z.string(),
          abr: z.array(z.object({ cp: z.array(z.object({ cd: z.string(), ds: z.string() })) })),
        }),
      ),
    }),
  ),
});
export type CatalogoApi = z.infer<typeof catalogoSchema>;

const candidatoSchema = z.object({
  n: inteiro,
  nmu: z.string().min(1),
  vap: inteiro,
  pvapn: decimal,
  // "Eleito", "Eleito por QP"..., "Não eleito" ou "2º turno". Este último NÃO é eleito.
  st: z.string().min(1),
});

// GET /oficial/{ciclo}/{eleição}/dados/{uf}/{uf}-c{cargo}-e{eleição}-u.json
export const resultadoSchema = z.object({
  ele: z.string(),
  t: inteiro,
  tpabr: z.string(),
  cdabr: z.string(),
  e: z.object({ te: inteiro, c: inteiro, a: inteiro }),
  v: z.object({ vb: inteiro, tvn: inteiro, vvc: inteiro }),
  carg: z
    .array(
      z.object({
        cd: z.string(),
        nmn: z.string(),
        agr: z.array(
          z.object({
            par: z.array(z.object({ sg: z.string().min(1), cand: z.array(candidatoSchema) })),
          }),
        ),
      }),
    )
    .length(1),
});
export type ResultadoApi = z.infer<typeof resultadoSchema>;
