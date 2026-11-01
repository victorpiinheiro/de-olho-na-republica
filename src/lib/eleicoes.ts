// Lógica pura da tela de eleições (sem Prisma): roda no servidor e no navegador.

export type Cargo = "Presidente" | "Governador";

export interface CandidatoEleicao {
  numero: number;
  nome: string;
  partido: string;
  votos: number;
  percentual: number;
  eleito: boolean;
}

export interface Turno {
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancosNulos: number;
  votosValidos: number;
  candidatos: CandidatoEleicao[];
}

export interface Disputa {
  cargo: Cargo;
  uf: string; // "BR" ou sigla da UF
  turno1: Turno;
  turno2: Turno | null;
}

export interface Finalista {
  candidato: CandidatoEleicao; // dados do 2º turno
  noTurno1: CandidatoEleicao | null;
}

// Finalistas = candidatos do 2º turno, o vencedor (mais votos) primeiro.
export function finalistas(d: Disputa): Finalista[] {
  if (!d.turno2) return [];
  return [...d.turno2.candidatos]
    .sort((a, b) => b.votos - a.votos)
    .map((c) => ({
      candidato: c,
      noTurno1: d.turno1.candidatos.find((x) => x.numero === c.numero) ?? null,
    }));
}

// Candidatos do 1º turno que não chegaram ao 2º, do mais votado para o menos.
export function foraDoSegundoTurno(d: Disputa): CandidatoEleicao[] {
  if (!d.turno2) return [];
  const finais = new Set(d.turno2.candidatos.map((c) => c.numero));
  return d.turno1.candidatos.filter((c) => !finais.has(c.numero)).sort((a, b) => b.votos - a.votos);
}

export const pctDoEleitorado = (parte: number, aptos: number) => (aptos > 0 ? (parte / aptos) * 100 : 0);
export const pctDoComparecimento = (parte: number, comp: number) => (comp > 0 ? (parte / comp) * 100 : 0);

export interface LadoUf {
  nome: string;
  p1: number;
  p2: number;
}

export interface LinhaUf {
  uf: string;
  aptos: number;
  a: LadoUf;
  b: LadoUf;
  virada: boolean;
}

const lado = (c: CandidatoEleicao, d: Disputa): LadoUf | null => {
  const no1 = d.turno1.candidatos.find((x) => x.numero === c.numero);
  const no2 = d.turno2?.candidatos.find((x) => x.numero === c.numero);
  return no1 && no2 ? { nome: c.nome, p1: no1.percentual, p2: no2.percentual } : null;
};

// Uma linha por UF que teve 2º turno. Para Presidente, A e B são os finalistas nacionais (A = vencedor);
// para Governador, cada UF tem os seus. "Virada" = quem liderava o 1º turno entre os dois perdeu o 2º.
export function linhasPorUf(disputas: Disputa[], cargo: Cargo): LinhaUf[] {
  const doCargo = disputas.filter((d) => d.cargo === cargo);
  const nacional = finalistas(doCargo.find((d) => d.uf === "BR") ?? ({ turno2: null } as Disputa));
  const linhas: LinhaUf[] = [];

  for (const d of doCargo) {
    if (d.uf === "BR" || !d.turno2) continue;
    const [fa, fb] =
      cargo === "Presidente" ? nacional.map((f) => f.candidato) : finalistas(d).map((f) => f.candidato);
    const a = fa && lado(fa, d);
    const b = fb && lado(fb, d);
    if (!a || !b) continue;
    const lider1 = a.p1 >= b.p1 ? "a" : "b";
    const lider2 = a.p2 >= b.p2 ? "a" : "b";
    linhas.push({ uf: d.uf, aptos: d.turno1.aptos, a, b, virada: lider1 !== lider2 });
  }
  return linhas.sort((x, y) => y.aptos - x.aptos);
}
