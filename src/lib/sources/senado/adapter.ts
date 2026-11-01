import { createHash } from "node:crypto";
import type {
  DespesaCeapsApi,
  MateriaApi,
  ProcessoApi,
  SenadorApi,
  VotacaoSenadoApi,
} from "./schemas";

export const SEM_PARTIDO = "Sem partido informado";
export const SEM_CATEGORIA = "Categoria não informada";

const vazioParaNull = (s: string | null | undefined) => (s && s.trim() !== "" ? s.trim() : null);

// "Maria da Silva" e "MARIA DA SILVA" são a mesma pessoa para ligar autoria a senador.
export const normalizarNome = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().trim();

const capitalizar = (s: string) => {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// A UF fica na identificação (lista atual) ou nos mandatos (lista da legislatura).
export function ufDoSenador(s: SenadorApi): string {
  const direta = s.IdentificacaoParlamentar.UfParlamentar ?? s.Mandato?.UfParlamentar;
  if (direta) return direta;
  const mandatos = s.Mandatos?.Mandato;
  const lista = Array.isArray(mandatos) ? mandatos : mandatos ? [mandatos] : [];
  const uf = lista.find((m) => m.UfParlamentar)?.UfParlamentar;
  if (!uf) throw new Error(`senador ${s.IdentificacaoParlamentar.CodigoParlamentar} sem UF na fonte`);
  return uf;
}

export function toParlamentarSenador(s: SenadorApi, ativo: boolean, legislatura: number) {
  const i = s.IdentificacaoParlamentar;
  return {
    casa: "SENADO" as const,
    idOrigem: String(i.CodigoParlamentar),
    nome: i.NomeParlamentar,
    nomeCivil: vazioParaNull(i.NomeCompletoParlamentar),
    partido: vazioParaNull(i.SiglaPartidoParlamentar) ?? SEM_PARTIDO,
    uf: ufDoSenador(s),
    // A fonte devolve http://; o site é https, então o navegador bloquearia a foto.
    fotoUrl: vazioParaNull(i.UrlFotoParlamentar)?.replace(/^http:\/\//, "https://") ?? null,
    email: vazioParaNull(i.EmailParlamentar),
    legislatura,
    ativo,
  };
}

// O id da API é único por documento (é o COD_DOCUMENTO do CSV); o prefixo evita colidir com os
// hashes da Câmara na coluna única Despesa.hash.
export const hashDespesaCeaps = (id: number) =>
  createHash("sha1").update(`SENADO|${id}`).digest("hex");

export function toDespesaCeaps(r: DespesaCeapsApi) {
  return {
    idOrigemSenador: String(r.codSenador),
    // Competência (ano/mês de referência), não o ano da data do documento: 102 linhas de 2026 têm data de 2025.
    ano: r.ano,
    mes: r.mes,
    tipo: vazioParaNull(r.tipoDespesa) ?? SEM_CATEGORIA,
    fornecedor: r.fornecedor.trim(),
    cnpjCpf: vazioParaNull(r.cpfCnpj),
    valor: r.valorReembolsado.toFixed(2),
    dataDocumento: new Date(`${r.data}T00:00:00Z`),
    // A API de dados abertos não expõe link da nota dos senadores.
    urlDocumento: null,
    hash: hashDespesaCeaps(r.id),
  };
}

const TIPO_VOTO = {
  Sim: "SIM",
  Não: "NAO",
  Abstenção: "ABSTENCAO",
  "Presidente (art. 51 RISF)": "PRESIDENTE",
  "P-NRV": "PRESENTE_SEM_VOTO",
  AP: "AUSENTE",
  LS: "AUSENTE",
  MIS: "AUSENTE",
  LP: "AUSENTE",
  NCom: "AUSENTE",
  LAP: "AUSENTE",
} as const;

export type TipoVotoSenado = (typeof TIPO_VOTO)[keyof typeof TIPO_VOTO];

export type ClassificacaoSenado =
  | { tipo: "secreta"; votos: [] }
  | {
      tipo: "nominal";
      votos: { idOrigemSenador: string; partido: string; voto: TipoVotoSenado }[];
    };

const REVELAM_VOTO = ["Sim", "Não", "Abstenção"];

// "NA" (dispositivo não citado) não é voto nem ausência: a linha é descartada.
// Votação secreta: só se sabe quem participou ("Votou"), então não guardamos votos.
// Sim/Não/Abstenção numa secreta, ou "Votou" numa nominal, é formato inesperado: quebra.
export function classificarVotosSenado(v: VotacaoSenadoApi): ClassificacaoSenado {
  if (v.votacaoSecreta === "S") {
    if (v.votos.some((x) => REVELAM_VOTO.includes(x.siglaVotoParlamentar))) {
      throw new Error(`votação secreta ${v.codigoSessaoVotacao} com votos revelados`);
    }
    return { tipo: "secreta", votos: [] };
  }
  if (v.votos.some((x) => x.siglaVotoParlamentar === "Votou")) {
    throw new Error(`votação nominal ${v.codigoSessaoVotacao} com voto "Votou"`);
  }
  return {
    tipo: "nominal",
    votos: v.votos.flatMap((x) =>
      x.siglaVotoParlamentar === "NA" || x.siglaVotoParlamentar === "Votou"
        ? []
        : [
            {
              idOrigemSenador: String(x.codigoParlamentar),
              partido: x.siglaPartidoParlamentar,
              voto: TIPO_VOTO[x.siglaVotoParlamentar],
            },
          ],
    ),
  };
}

// A API só informa A/R; os totais vêm nulos, então o placar é calculado dos votos.
// O resultado oficial prevalece sobre Sim > Não (quórum especial em PEC, por exemplo).
export function toVotacaoSenado(v: VotacaoSenadoApi, c: ClassificacaoSenado) {
  const nominal = c.tipo === "nominal" ? c.votos : [];
  const conta = (t: TipoVotoSenado) => nominal.filter((x) => x.voto === t).length;
  return {
    casa: "SENADO" as const,
    idOrigem: String(v.codigoSessaoVotacao),
    // Só a data da sessão é informada: meio-dia de Brasília mantém o dia certo em qualquer fuso.
    data: new Date(`${v.dataSessao}T12:00:00-03:00`),
    descricao: v.descricaoVotacao,
    aprovada: v.resultadoVotacao === "A",
    simbolica: false,
    secreta: c.tipo === "secreta",
    votosSim: conta("SIM"),
    votosNao: conta("NAO"),
    votosAbstencao: conta("ABSTENCAO"),
  };
}

// Lei com veto parcial continua sendo lei; "VTDA" (vetada, veto total) não é.
const SITUACOES_NORMA_JURIDICA = new Set(["TNJR", "TNJRVETO"]);

export const viraNormaJuridica = (siglaSituacao: string | null | undefined) =>
  !!siglaSituacao && SITUACOES_NORMA_JURIDICA.has(siglaSituacao);

const dataDia = (s: string | null | undefined): Date | null => {
  const dia = s?.slice(0, 10);
  return dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T00:00:00Z`) : null;
};

export function toProposicaoSenado(p: ProcessoApi, normaJuridica: string | null) {
  return {
    casa: "SENADO" as const,
    idOrigem: String(p.id),
    siglaTipo: p.sigla,
    numero: p.numero,
    ano: p.ano,
    ementa: p.conteudo.ementa?.trim() ?? "",
    urlInteiroTeor: vazioParaNull(p.documento.url),
    situacao: p.situacaoAtual ? capitalizar(p.situacaoAtual) : null,
    virouLei: viraNormaJuridica(p.siglaSituacaoAtual),
    normaJuridica,
    dataLei: viraNormaJuridica(p.siglaSituacaoAtual) ? dataDia(p.normaGerada?.dataAssinatura) : null,
    dataApresentacao: p.documento.dataApresentacao
      ? new Date(`${p.documento.dataApresentacao.slice(0, 10)}T00:00:00Z`)
      : null,
  };
}

// "Emenda Constitucional Numerada" 141/2026 → "Emenda Constitucional 141/2026".
export function normaGerada(m: MateriaApi): string | null {
  const norma = Object.values(m)[0]?.Materia.NormaGerada?.IdentificacaoNorma;
  const primeira = Array.isArray(norma) ? norma[0] : norma;
  if (!primeira) return null;
  const tipo = primeira.DescricaoTipoNorma.replace(/\s+Numerad[oa]$/i, "").trim();
  return `${tipo} ${primeira.NumeroNorma}/${primeira.AnoNorma}`;
}

const TIPO_AUTOR: Record<string, string> = { DEPUTADO: "Deputado(a)", SENADOR: "Senador(a)" };

// Autoria da iniciativa (quem apresentou de fato) vem antes da autoria do documento
// (que, numa matéria vinda da Câmara, é só "Câmara dos Deputados").
// Só liga ao parlamentar quando é senador e o nome bate exatamente com um senador conhecido.
export function toAutoresSenado(p: ProcessoApi, idPorNomeSenador: Map<string, number>) {
  const fonte = p.autoriaIniciativa?.length ? p.autoriaIniciativa : (p.documento.autoria ?? []);
  const porNome = new Map<string, { nome: string; tipo: string; ordem: number; parlamentarId: number | null }>();
  fonte.forEach((a, ordem) => {
    porNome.set(a.autor, {
      nome: a.autor,
      tipo: TIPO_AUTOR[a.siglaTipo] ?? a.descricaoTipo ?? a.siglaTipo,
      ordem,
      parlamentarId:
        a.siglaTipo === "SENADOR" ? (idPorNomeSenador.get(normalizarNome(a.autor)) ?? null) : null,
    });
  });
  return [...porNome.values()];
}
