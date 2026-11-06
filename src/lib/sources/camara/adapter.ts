import { createHash } from "node:crypto";
import type {
  AutorApi,
  DeputadoApi,
  DespesaCsv,
  OrientacaoApi,
  ProposicaoApi,
  TramitacaoApi,
  VotacaoApi,
  VotoApi,
} from "./schemas";

export function toParlamentar(d: DeputadoApi) {
  return {
    casa: "CAMARA" as const,
    idOrigem: String(d.id),
    nome: d.nome,
    partido: d.siglaPartido,
    uf: d.siglaUf,
    fotoUrl: d.urlFoto,
    email: d.email,
    legislatura: d.idLegislatura,
  };
}

// Une a legislatura inteira com os em exercício. Repetidos (troca de partido) viram um só;
// os dados de quem está em exercício prevalecem, e só eles ficam ativos.
export function unirDeputados(legislatura: DeputadoApi[], emExercicio: DeputadoApi[]) {
  const porId = new Map<string, ReturnType<typeof toParlamentar> & { ativo: boolean }>();
  for (const d of legislatura) porId.set(String(d.id), { ...toParlamentar(d), ativo: false });
  for (const d of emExercicio) porId.set(String(d.id), { ...toParlamentar(d), ativo: true });
  return [...porId.values()];
}

const vazioParaNull = (s: string) => (s.trim() === "" ? null : s.trim());

function parseData(s: string): Date | null {
  const dia = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// A origem repete linhas; o hash dos campos identifica a despesa.
// ideDocumento entra no hash para não fundir documentos diferentes com os mesmos valores.
export function hashDespesa(r: DespesaCsv): string {
  const partes = [
    r.ideCadastro,
    r.txtNumero,
    r.txtCNPJCPF,
    r.datEmissao,
    r.vlrLiquido,
    r.numSubCota,
    r.numParcela,
    r.ideDocumento,
  ];
  return createHash("sha1").update(partes.join("|")).digest("hex");
}

export function toDespesa(r: DespesaCsv) {
  return {
    idOrigemDeputado: r.ideCadastro,
    ano: r.numAno,
    mes: r.numMes,
    tipo: r.txtDescricao,
    fornecedor: r.txtFornecedor,
    cnpjCpf: vazioParaNull(r.txtCNPJCPF),
    valor: r.vlrLiquido,
    dataDocumento: parseData(r.datEmissao),
    urlDocumento: vazioParaNull(r.urlDocumento),
    hash: hashDespesa(r),
  };
}

// Só estas proposições viram "lei" na nossa tela. Requerimentos, emendas e pareceres,
// que aparecem em objetosPossiveis, não entram.
const TIPOS_NORMA = new Set(["PL", "PLP", "PEC", "MPV", "PDL", "PLV"]);
// codSituacao "Transformado em Norma Jurídica" nas situações oficiais da Câmara.
const SITUACAO_NORMA_JURIDICA = 1140;

export const ehProposicaoNorma = (siglaTipo: string) => TIPOS_NORMA.has(siglaTipo);

export function proposicaoPrincipal(afetadas: VotacaoApi["proposicoesAfetadas"]) {
  const normas = afetadas.filter((p) => TIPOS_NORMA.has(p.siglaTipo));
  return normas.length === 1 ? normas[0]! : null;
}

export function toProposicao(p: ProposicaoApi) {
  return {
    casa: "CAMARA" as const,
    idOrigem: String(p.id),
    siglaTipo: p.siglaTipo,
    numero: p.numero,
    ano: p.ano,
    ementa: p.ementa,
    urlInteiroTeor: p.urlInteiroTeor,
    situacao: p.statusProposicao.descricaoSituacao,
    virouLei: p.statusProposicao.codSituacao === SITUACAO_NORMA_JURIDICA,
    dataApresentacao: p.dataApresentacao ? parseData(p.dataApresentacao) : null,
  };
}

const TIPO_VOTO = {
  Sim: "SIM",
  Não: "NAO",
  Abstenção: "ABSTENCAO",
  "Artigo 17": "PRESIDENTE",
} as const;

export type ClassificacaoVotos =
  | { tipo: "simbolica" | "secreta"; votos: [] }
  | {
      tipo: "nominal";
      votos: { idOrigemDeputado: string; partido: string; voto: (typeof TIPO_VOTO)[keyof typeof TIPO_VOTO] }[];
    };

// Lista vazia = votação simbólica. Todos com tipoVoto nulo = secreta (só se sabe quem votou).
// Mistura de nulos e votos é formato inesperado: melhor quebrar do que gravar errado.
export function classificarVotos(votos: VotoApi[]): ClassificacaoVotos {
  if (votos.length === 0) return { tipo: "simbolica", votos: [] };

  const nulos = votos.filter((v) => v.tipoVoto === null).length;
  if (nulos === votos.length) return { tipo: "secreta", votos: [] };
  if (nulos > 0) throw new Error(`votação com ${nulos} de ${votos.length} votos sem tipoVoto`);

  return {
    tipo: "nominal",
    votos: votos.map((v) => ({
      idOrigemDeputado: String(v.deputado_.id),
      partido: v.deputado_.siglaPartido,
      voto: TIPO_VOTO[v.tipoVoto!],
    })),
  };
}

// dataHoraRegistro vem sem fuso: horário de Brasília.
export function toVotacao(v: VotacaoApi, c: ClassificacaoVotos) {
  const nominal = c.tipo === "nominal" ? c.votos : [];
  const conta = (t: string) => nominal.filter((x) => x.voto === t).length;
  return {
    casa: "CAMARA" as const,
    idOrigem: v.id,
    data: new Date(`${v.dataHoraRegistro}-03:00`),
    descricao: v.descricao,
    aprovada: v.aprovacao === null ? null : v.aprovacao === 1,
    simbolica: c.tipo === "simbolica",
    secreta: c.tipo === "secreta",
    votosSim: conta("SIM"),
    votosNao: conta("NAO"),
    votosAbstencao: conta("ABSTENCAO"),
  };
}

// Orientação vazia = a liderança não orientou; não guardamos essas linhas.
export function toOrientacoes(os: OrientacaoApi[]) {
  const porPartido = new Map<string, string>();
  for (const o of os) if (o.orientacaoVoto) porPartido.set(o.siglaPartidoBloco, o.orientacaoVoto);
  return [...porPartido].map(([partido, orientacao]) => ({ partido, orientacao }));
}

// Autor que é deputado aponta para /deputados/{id}; Executivo, comissões etc. ficam sem vínculo.
export function toAutores(as: AutorApi[], idPorOrigem: Map<string, number>) {
  const porNome = new Map<string, { nome: string; tipo: string; ordem: number; parlamentarId: number | null }>();
  for (const a of as) {
    const idDeputado = /\/deputados\/(\d+)$/.exec(a.uri)?.[1];
    porNome.set(a.nome, {
      nome: a.nome,
      tipo: a.tipo,
      ordem: a.ordemAssinatura,
      parlamentarId: idDeputado ? (idPorOrigem.get(idDeputado) ?? null) : null,
    });
  }
  return [...porNome.values()];
}

// "Transformado na Lei Ordinária 14815/2024. DOU ..." ou "Decreto Legislativo 12/2026 - Aprova ...".
// Sem número no texto (acontece em MPV) devolve null: melhor vazio do que chute.
const NORMA = /^(?:Transformad[oa] n[ao]\s+)?(Lei Ordinária|Lei Complementar|Emenda Constitucional|Decreto Legislativo|Lei)\s+(?:n[º°.]?\s*)?(\d[\d.]*\/\d{4})\b/i;

// A data é a da tramitação que registra a transformação em norma (dia da sanção).
export function extrairNorma(tramitacoes: TramitacaoApi[]): { norma: string; data: Date | null } | null {
  for (const t of tramitacoes) {
    const m = NORMA.exec((t.despacho ?? "").trim());
    if (m) return { norma: `${m[1]} ${m[2]}`, data: parseData(t.dataHora) };
  }
  return null;
}

export const extrairNormaJuridica = (tramitacoes: TramitacaoApi[]): string | null =>
  extrairNorma(tramitacoes)?.norma ?? null;

// Vigência de uma medida provisória, lida das tramitações oficiais (nada é calculado por nós):
//  - "Abertura de Prazo": "... Congresso Nacional: 04/11/2026 a 12/02/2027." (início e fim dos primeiros 60 dias + recesso)
//  - "Prorrogação de Prazo": "... Data final após prorrogação: 01/06/2026." (a prorrogação por mais 60 dias)
// O texto da abertura também traz uma "Prorrogação pelo Congresso Nacional: <data>" que é só previsão; vale a tramitação
// de prorrogação de fato. Sem a abertura de prazo (MPV recém-chegada) devolve null, e a tela diz que o prazo não foi aberto.
const VIGENCIA = /Congresso Nacional:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/;
const FIM_PRORROGADO = /Data final após prorroga[çc][ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i;

const dataBrParaDate = (s: string) => {
  const [d, m, a] = s.split("/");
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
};

export function extrairVigencia(
  tramitacoes: TramitacaoApi[],
): { inicio: Date; fim: Date; prorrogada: boolean } | null {
  const abertura = tramitacoes.find((t) => t.descricaoTramitacao === "Abertura de Prazo" && VIGENCIA.test(t.despacho ?? ""));
  const m = abertura && VIGENCIA.exec(abertura.despacho ?? "");
  if (!m) return null;
  const prorrogacoes = tramitacoes
    .filter((t) => t.descricaoTramitacao === "Prorrogação de Prazo")
    .map((t) => FIM_PRORROGADO.exec(t.despacho ?? "")?.[1])
    .filter((x): x is string => !!x)
    .map(dataBrParaDate)
    .sort((a, b) => b.getTime() - a.getTime());
  const fimProrrogado = prorrogacoes[0];
  return {
    inicio: dataBrParaDate(m[1]!),
    fim: fimProrrogado ?? dataBrParaDate(m[2]!),
    prorrogada: fimProrrogado !== undefined,
  };
}

// Medida provisória de crédito extraordinário: abre crédito no orçamento, não muda regra. É a maioria e tende a poluir a lista.
export const ehCreditoExtraordinario = (ementa: string) => /^\s*abre cr[eé]dito extraordin[aá]rio/i.test(ementa);
