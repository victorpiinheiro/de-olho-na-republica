// Apresentação da "História do país": períodos, duração e iniciais. Puro (servidor e navegador).

export interface Periodo {
  id: string;
  nome: string;
  inicio: string; // YYYY-MM-DD, inclusive
}

// Definição editorial (não é dado coletado): cada mandato entra no período em que COMEÇA.
// Os marcos são datas históricas: proclamação (1889), Revolução de 1930, posse de Dutra (1946),
// golpe de 1964 e posse de Sarney (1985). Linhares (out/1945) cai na Era Vargas; Mazzilli (abr/1964) no regime militar.
export const PERIODOS: Periodo[] = [
  { id: "republica-velha", nome: "República Velha", inicio: "1889-11-15" },
  { id: "era-vargas", nome: "Era Vargas", inicio: "1930-10-24" },
  { id: "republica-1946", nome: "República de 1946", inicio: "1946-01-31" },
  { id: "regime-militar", nome: "Regime militar", inicio: "1964-04-01" },
  { id: "nova-republica", nome: "Nova República", inicio: "1985-03-15" },
];

export function periodoDe(inicio: string): Periodo {
  const achados = PERIODOS.filter((p) => p.inicio <= inicio);
  if (achados.length === 0) throw new Error(`mandato de ${inicio} anterior à República`);
  return achados[achados.length - 1];
}

const DIA_MS = 86_400_000;
const MES_DIAS = 30.4375;

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / DIA_MS);
}

export function duracaoTexto(dias: number): string {
  if (dias < 31) return `${dias} dia${dias === 1 ? "" : "s"}`;
  // Folga de 3 dias: um mandato de 31/01 a 31/01 tem 59,99 "meses médios" e deve contar como 5 anos.
  const meses = Math.floor((dias + 3) / MES_DIAS);
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = `${anos} ano${anos === 1 ? "" : "s"}`;
  return resto === 0 ? a : `${a} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
}

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
export function iniciais(nome: string): string {
  const partes = nome.split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  return (partes.length === 1 ? primeira : primeira + partes[partes.length - 1][0]).toUpperCase();
}

// "político sem partido" é um item do Wikidata, não uma sigla.
export const SEM_PARTIDO = "político sem partido";
export const partidoTexto = (nome: string) => (nome === SEM_PARTIDO ? "Sem partido" : nome);
