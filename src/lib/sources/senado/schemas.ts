import { z } from "zod";

// Todos os formatos abaixo foram confirmados na API real do Senado. Extras são ignorados;
// campo ausente ou valor fora do enum quebra a validação (nunca grava dado errado).

// GET /senador/lista/atual e /senador/lista/legislatura/{n}: JSON aninhado no estilo do XML.
// A lista da legislatura não traz partido para todos, e a UF fica em Mandatos.Mandato.
const mandatoSchema = z.object({ UfParlamentar: z.string().length(2).nullish() });
const umOuVarios = <T extends z.ZodType>(s: T) => z.union([s, z.array(s)]);

export const senadorSchema = z.object({
  IdentificacaoParlamentar: z.object({
    CodigoParlamentar: z.coerce.number().int(),
    NomeParlamentar: z.string(),
    NomeCompletoParlamentar: z.string().nullish(),
    UrlFotoParlamentar: z.string().nullish(),
    EmailParlamentar: z.string().nullish(),
    SiglaPartidoParlamentar: z.string().nullish(),
    UfParlamentar: z.string().length(2).nullish(),
  }),
  Mandato: mandatoSchema.nullish(),
  Mandatos: z.object({ Mandato: umOuVarios(mandatoSchema) }).nullish(),
});
export type SenadorApi = z.infer<typeof senadorSchema>;

// A raiz muda de nome entre as duas listas (ListaParlamentarEmExercicio, ListaParlamentarLegislatura...).
export const listaSenadoresSchema = z.record(
  z.string(),
  z.object({ Parlamentares: z.object({ Parlamentar: z.array(senadorSchema) }) }),
);

// API administrativa: GET /senadores/despesas_ceaps/{ano}. Traz o código do senador, ao contrário do CSV.
export const despesaCeapsSchema = z.object({
  id: z.number().int(),
  tipoDocumento: z.string().nullish(),
  ano: z.number().int().min(2000),
  mes: z.number().int().min(1).max(12),
  codSenador: z.number().int(),
  nomeSenador: z.string(),
  // Nulo nos "Recibo" de pessoa física.
  tipoDespesa: z.string().nullable(),
  cpfCnpj: z.string(),
  fornecedor: z.string(),
  documento: z.string().nullish(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  detalhamento: z.string().nullish(),
  valorReembolsado: z.number(),
});
export type DespesaCeapsApi = z.infer<typeof despesaCeapsSchema>;

// Códigos de voto com o significado dado pela própria API (descricaoVotoParlamentar).
export const SIGLAS_VOTO = [
  "Sim",
  "Não",
  "Abstenção",
  "Presidente (art. 51 RISF)",
  "P-NRV", // Presente – Não registrou voto
  "AP", // Atividade parlamentar
  "LS", // Licença saúde
  "MIS", // Missão da Casa no País/exterior
  "LP", // Licença particular
  "NCom", // Não compareceu
  "LAP", // Licença paternidade ou ao adotante
  "NA", // Dispositivo não citado
  "Votou", // Votação secreta: só se sabe que participou
] as const;

// GET /votacao?dataInicio=YYYY-MM-DD&dataFim=...: só votações nominais, com os 81 votos dentro.
export const votacaoSenadoSchema = z.object({
  codigoSessaoVotacao: z.number().int(),
  idProcesso: z.number().int(),
  sigla: z.string(),
  dataSessao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descricaoVotacao: z.string(),
  resultadoVotacao: z.enum(["A", "R"]),
  votacaoSecreta: z.enum(["S", "N"]),
  votos: z.array(
    z.object({
      codigoParlamentar: z.number().int(),
      siglaPartidoParlamentar: z.string(),
      siglaVotoParlamentar: z.enum(SIGLAS_VOTO),
    }),
  ),
});
export type VotacaoSenadoApi = z.infer<typeof votacaoSenadoSchema>;

const autoriaSchema = z.object({
  autor: z.string(),
  siglaTipo: z.string(),
  descricaoTipo: z.string().nullish(),
});

// GET /processo/{idProcesso}
export const processoSchema = z.object({
  id: z.number().int(),
  codigoMateria: z.number().int().nullish(),
  sigla: z.string(),
  numero: z.coerce.number().int(),
  ano: z.coerce.number().int(),
  apelido: z.string().nullish(),
  conteudo: z.object({ ementa: z.string().nullish() }),
  documento: z.object({
    dataApresentacao: z.string().nullish(),
    url: z.string().nullish(),
    autoria: z.array(autoriaSchema).nullish(),
  }),
  situacaoAtual: z.string().nullish(),
  siglaSituacaoAtual: z.string().nullish(),
  normaGerada: z.object({ dataAssinatura: z.string().nullish() }).nullish(),
  autoriaIniciativa: z.array(autoriaSchema).nullish(),
});
export type ProcessoApi = z.infer<typeof processoSchema>;

const normaSchema = z.object({
  DescricaoTipoNorma: z.string(),
  NumeroNorma: z.coerce.number().int(),
  AnoNorma: z.coerce.number().int(),
});

// GET /materia/{codigo}: só nos interessa o número da norma gerada (quando existe).
export const materiaSchema = z.record(
  z.string(),
  z.object({
    Materia: z.object({
      NormaGerada: z
        .object({ IdentificacaoNorma: z.union([normaSchema, z.array(normaSchema)]) })
        .nullish(),
    }),
  }),
);
export type MateriaApi = z.infer<typeof materiaSchema>;
