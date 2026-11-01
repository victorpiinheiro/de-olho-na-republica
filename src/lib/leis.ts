export type Aba = "todas" | "nominais" | "viraram-lei" | "aprovadas-camara" | "aprovadas-senado" | "rejeitadas";

export const ABAS: { chave: Aba; rotulo: string; href: string }[] = [
  { chave: "todas", rotulo: "Todas", href: "/leis" },
  { chave: "nominais", rotulo: "Com votos nominais", href: "/leis/nominais" },
  { chave: "viraram-lei", rotulo: "Viraram lei", href: "/leis/viraram-lei" },
  { chave: "aprovadas-camara", rotulo: "Aprovadas na Câmara", href: "/leis/aprovadas-camara" },
  { chave: "aprovadas-senado", rotulo: "Aprovadas no Senado", href: "/leis/aprovadas-senado" },
  { chave: "rejeitadas", rotulo: "Rejeitadas", href: "/leis/rejeitadas" },
];

// Situações oficiais (referencias/situacoesProposicao) de quem já passou pela Câmara e
// segue para o Senado.
export const SITUACOES_APROVADA_CAMARA = [
  "Aguardando Apreciação pelo Senado Federal",
  "Aguardando Envio ao Senado Federal",
  "Enviada ao Senado Federal",
];
export const SITUACAO_ARQUIVADA = "Arquivada";

export type EstadoVotacao = "nominal" | "simbolica" | "secreta";

export interface VotacaoResumo {
  data: Date;
  descricao: string;
  aprovada: boolean | null;
  simbolica: boolean;
  secreta: boolean;
  votosSim: number;
  votosNao: number;
  votosAbstencao: number;
}

export const estadoDe = (v: Pick<VotacaoResumo, "simbolica" | "secreta">): EstadoVotacao =>
  v.simbolica ? "simbolica" : v.secreta ? "secreta" : "nominal";

const maisRecenteDepois = (a: { data: Date }, b: { data: Date }) => b.data.getTime() - a.data.getTime();

export function ultimaVotacao<T extends VotacaoResumo>(votacoes: T[]): T | null {
  return [...votacoes].sort(maisRecenteDepois)[0] ?? null;
}

// A votação mais recente com placar nominal; sem nenhuma, a mais recente de todas.
// Evita mostrar "Redação Final, simbólica" quando houve um placar de verdade antes.
export function votacaoDestaque<T extends VotacaoResumo>(votacoes: T[]): T | null {
  const ordenadas = [...votacoes].sort(maisRecenteDepois);
  return ordenadas.find((v) => estadoDe(v) === "nominal") ?? ordenadas[0] ?? null;
}

// Há registro de como cada parlamentar votou (nominal e com votos computados).
export const temVotoNominal = (v: VotacaoResumo) =>
  estadoDe(v) === "nominal" && v.votosSim + v.votosNao + v.votosAbstencao > 0;

export type CasaLegislativa = "CAMARA" | "SENADO";

export const NOME_CASA: Record<CasaLegislativa, string> = { CAMARA: "Câmara", SENADO: "Senado" };

export interface PropAba {
  casa: CasaLegislativa;
  virouLei: boolean;
  situacao: string | null;
  votacoes: VotacaoResumo[];
}

// Câmara: a situação oficial da proposição diz se já seguiu ao Senado ou foi arquivada.
// Senado: não há "enviada a outra casa" confiável nos dados, então vale o resultado da última
// votação do plenário (a norma gerada já é coberta por `virouLei`).
export function pertenceAba(p: PropAba, aba: Aba): boolean {
  const ultima = ultimaVotacao(p.votacoes);
  switch (aba) {
    case "todas":
      return true;
    case "nominais":
      return p.votacoes.some(temVotoNominal);
    case "viraram-lei":
      return p.virouLei;
    case "aprovadas-camara":
      return (
        p.casa === "CAMARA" &&
        !p.virouLei &&
        p.situacao !== null &&
        SITUACOES_APROVADA_CAMARA.includes(p.situacao)
      );
    case "aprovadas-senado":
      return p.casa === "SENADO" && !p.virouLei && ultima?.aprovada === true;
    case "rejeitadas":
      // Câmara: arquivada E a última votação foi rejeitada (arquivar sozinho pode ter outras causas).
      return p.casa === "CAMARA"
        ? p.situacao === SITUACAO_ARQUIVADA && ultima?.aprovada === false
        : ultima?.aprovada === false;
  }
}

export const codigo = (p: { siglaTipo: string; numero: number; ano: number }) =>
  `${p.siglaTipo} ${p.numero}/${p.ano}`;

// Larguras em % para a barra empilhada. Sem votos devolve zeros (a tela mostra o estado).
export function placar(sim: number, nao: number, abst: number) {
  const total = sim + nao + abst;
  if (total === 0) return { total, sim: 0, nao: 0, abst: 0 };
  return { total, sim: (sim / total) * 100, nao: (nao / total) * 100, abst: (abst / total) * 100 };
}

export function rotuloResultado(aprovada: boolean | null): string {
  return aprovada === null ? "Sem resultado" : aprovada ? "Aprovada" : "Rejeitada";
}

export type TomStatus = "lei" | "rejeitada" | "neutro";

// Rótulo do selo do card, na ordem de importância: virou lei > rejeitada > aprovada na Câmara > situação.
export function statusDe(p: PropAba): { rotulo: string; tom: TomStatus } {
  if (p.virouLei) return { rotulo: "Virou lei", tom: "lei" };
  if (pertenceAba(p, "rejeitadas")) return { rotulo: "Rejeitada", tom: "rejeitada" };
  if (pertenceAba(p, "aprovadas-camara")) return { rotulo: "Aprovada na Câmara", tom: "neutro" };
  if (pertenceAba(p, "aprovadas-senado")) return { rotulo: "Aprovada no Senado", tom: "neutro" };
  return { rotulo: p.situacao ?? "Em tramitação", tom: "neutro" };
}

// "Dep. Ana (PT–SP)"; autores que não são parlamentares (Executivo, comissões) ficam só com o nome.
export function autoriaTexto(
  autor: { nome: string; tipo: string | null; partido?: string; uf?: string },
  outros: number,
): string {
  const prefixo = autor.tipo?.startsWith("Deputado") ? "Dep. " : autor.tipo?.startsWith("Senador") ? "Sen. " : "";
  const semPartido = autor.partido?.startsWith("Sem partido");
  const sigla = autor.uf
    ? semPartido
      ? ` (${autor.uf})`
      : autor.partido
        ? ` (${autor.partido}–${autor.uf})`
        : ""
    : "";
  const resto = outros === 1 ? " e outro autor" : outros > 1 ? ` e outros ${outros}` : "";
  return `${prefixo}${autor.nome}${sigla}${resto}`;
}
