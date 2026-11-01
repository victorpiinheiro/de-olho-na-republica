import { z } from "zod";

// GET /deputados (confirmado na API real). Extras são ignorados; campo ausente quebra.
export const deputadoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  siglaPartido: z.string(),
  siglaUf: z.string().length(2),
  idLegislatura: z.number().int(),
  urlFoto: z.string().nullable(),
  email: z.string().nullable(),
});
export type DeputadoApi = z.infer<typeof deputadoSchema>;

// Colunas do CSV anual de cota parlamentar (Ano-AAAA.csv). Todas as colunas
// listadas aqui são obrigatórias: se a Câmara renomear uma, o job quebra.
export const COLUNAS_DESPESA_CSV = [
  "ideCadastro",
  "txtDescricao",
  "txtFornecedor",
  "txtCNPJCPF",
  "txtNumero",
  "numSubCota",
  "numParcela",
  "datEmissao",
  "vlrLiquido",
  "numMes",
  "numAno",
  "ideDocumento",
  "urlDocumento",
] as const;

export const despesaCsvSchema = z.object({
  // vazio nas linhas de lideranças e órgãos, que não são deputados
  ideCadastro: z.string().regex(/^\d*$/),
  txtDescricao: z.string(),
  txtFornecedor: z.string(),
  txtCNPJCPF: z.string(),
  txtNumero: z.string(),
  numSubCota: z.string(),
  numParcela: z.string(),
  datEmissao: z.string(),
  vlrLiquido: z.string().regex(/^-?\d+(\.\d+)?$/),
  numMes: z.coerce.number().int().min(1).max(12),
  numAno: z.coerce.number().int().min(2000),
  ideDocumento: z.string(),
  urlDocumento: z.string(),
});
export type DespesaCsv = z.infer<typeof despesaCsvSchema>;

// GET /votacoes (confirmado na API real). `proposicaoObjeto` é ignorado de propósito: aponta
// para requerimentos/emendas, não para a proposição principal.
export const votacaoListaSchema = z.object({
  id: z.string(),
});

export const proposicaoResumoSchema = z.object({
  id: z.number().int(),
  siglaTipo: z.string(),
  numero: z.number().int(),
  ano: z.number().int(),
});

// GET /votacoes/{id}. `aprovacao` vem nulo quando a votação não tem resultado de aprovação.
export const votacaoSchema = z.object({
  id: z.string(),
  dataHoraRegistro: z.string(),
  descricao: z.string(),
  aprovacao: z.union([z.literal(0), z.literal(1)]).nullable(),
  proposicoesAfetadas: z.array(proposicaoResumoSchema),
});
export type VotacaoApi = z.infer<typeof votacaoSchema>;

// GET /votacoes/{id}/votos. Simbólica = lista vazia; secreta = tipoVoto nulo em todos.
export const TIPOS_VOTO = ["Sim", "Não", "Abstenção", "Artigo 17"] as const;

export const votoSchema = z.object({
  tipoVoto: z.enum(TIPOS_VOTO).nullable(),
  deputado_: z.object({
    id: z.number().int(),
    siglaPartido: z.string(),
  }),
});
export type VotoApi = z.infer<typeof votoSchema>;

// GET /votacoes/{id}/orientacoes. Vazio = a liderança não orientou.
export const orientacaoSchema = z.object({
  orientacaoVoto: z.string(),
  siglaPartidoBloco: z.string(),
});
export type OrientacaoApi = z.infer<typeof orientacaoSchema>;

// GET /proposicoes/{id}
export const proposicaoSchema = z.object({
  id: z.number().int(),
  siglaTipo: z.string(),
  numero: z.number().int(),
  ano: z.number().int(),
  ementa: z.string(),
  dataApresentacao: z.string().nullable(),
  urlInteiroTeor: z.string().nullable(),
  statusProposicao: z.object({
    codSituacao: z.number().int().nullable(),
    descricaoSituacao: z.string().nullable(),
  }),
});
export type ProposicaoApi = z.infer<typeof proposicaoSchema>;

// GET /proposicoes/{id}/autores
export const autorSchema = z.object({
  uri: z.string(),
  nome: z.string(),
  tipo: z.string(),
  ordemAssinatura: z.number().int(),
});
export type AutorApi = z.infer<typeof autorSchema>;

// GET /proposicoes/{id}/tramitacoes. O codSituacao de cada linha reflete a situação ATUAL
// da proposição, não a da época; por isso a linha certa é achada pelo texto do despacho.
export const tramitacaoSchema = z.object({
  dataHora: z.string(),
  descricaoTramitacao: z.string(),
  despacho: z.string().nullish(),
});
export type TramitacaoApi = z.infer<typeof tramitacaoSchema>;
