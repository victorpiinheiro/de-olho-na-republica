import { z } from "zod";

const valor = z.object({ value: z.string() });

// SPARQL JSON. Se uma variável pedida na consulta mudar de nome, a validação quebra.
export const mandatoRowSchema = z.object({
  item: valor,
  itemLabel: valor,
  inicio: valor,
  fim: valor.optional(),
});
export const partidoRowSchema = z.object({
  item: valor,
  partidoLabel: valor,
});

const resposta = <T extends z.ZodType>(row: T) =>
  z.object({ results: z.object({ bindings: z.array(row) }) });

export const mandatosSchema = resposta(mandatoRowSchema);
export const partidosSchema = resposta(partidoRowSchema);

export type MandatoRow = z.infer<typeof mandatoRowSchema>;
export type PartidoRow = z.infer<typeof partidoRowSchema>;
