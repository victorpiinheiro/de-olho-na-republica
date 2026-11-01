import { describe, expect, it } from "vitest";
import {
  finalistas,
  foraDoSegundoTurno,
  linhasPorUf,
  type CandidatoEleicao,
  type Disputa,
  type Turno,
} from "./eleicoes";

const c = (numero: number, nome: string, percentual: number, votos = percentual * 1000): CandidatoEleicao => ({
  numero, nome, partido: "X", votos, percentual, eleito: false,
});
const turno = (candidatos: CandidatoEleicao[], aptos = 1000): Turno => ({
  aptos, comparecimento: 800, abstencoes: 200, brancosNulos: 40, votosValidos: 760, candidatos,
});
const disputa = (cargo: Disputa["cargo"], uf: string, t1: CandidatoEleicao[], t2: CandidatoEleicao[] | null, aptos = 1000): Disputa => ({
  cargo, uf, turno1: turno(t1, aptos), turno2: t2 && turno(t2, aptos),
});

describe("finalistas / foraDoSegundoTurno", () => {
  const d = disputa("Presidente", "BR",
    [c(13, "Lula", 45), c(22, "Flavio", 47), c(30, "Terceiro", 5), c(40, "Quarto", 3)],
    [c(13, "Lula", 51), c(22, "Flavio", 49)]);

  it("coloca o vencedor primeiro e liga ao resultado do 1º turno", () => {
    const f = finalistas(d);
    expect(f.map((x) => x.candidato.nome)).toEqual(["Lula", "Flavio"]);
    expect(f[0].noTurno1?.percentual).toBe(45);
  });

  it("lista quem ficou fora, do mais votado ao menos", () => {
    expect(foraDoSegundoTurno(d).map((x) => x.nome)).toEqual(["Terceiro", "Quarto"]);
  });

  it("sem 2º turno não há finalistas nem 'fora'", () => {
    const sem = disputa("Governador", "SP", [c(1, "A", 55)], null);
    expect(finalistas(sem)).toEqual([]);
    expect(foraDoSegundoTurno(sem)).toEqual([]);
  });
});

describe("linhasPorUf", () => {
  const br = disputa("Presidente", "BR", [c(13, "Lula", 45), c(22, "Flavio", 47), c(30, "T", 8)], [c(13, "Lula", 52), c(22, "Flavio", 48)], 5000);
  const sp = disputa("Presidente", "SP", [c(13, "Lula", 38), c(22, "Flavio", 52), c(30, "T", 10)], [c(13, "Lula", 40), c(22, "Flavio", 60)], 3000);
  const ba = disputa("Presidente", "BA", [c(13, "Lula", 60), c(22, "Flavio", 30), c(30, "T", 10)], [c(13, "Lula", 66), c(22, "Flavio", 34)], 2000);
  // Flavio liderava o 1º turno em GO e perdeu o 2º.
  const go = disputa("Presidente", "GO", [c(13, "Lula", 40), c(22, "Flavio", 41), c(30, "T", 19)], [c(13, "Lula", 50.5), c(22, "Flavio", 49.5)], 1000);

  it("usa os finalistas nacionais, ordena por eleitorado e marca a virada", () => {
    const linhas = linhasPorUf([go, ba, br, sp], "Presidente");
    expect(linhas.map((l) => l.uf)).toEqual(["SP", "BA", "GO"]);
    expect(linhas.map((l) => l.virada)).toEqual([false, false, true]);
    expect(linhas[0].a).toEqual({ nome: "Lula", p1: 38, p2: 40 });
  });

  it("Governador: cada UF tem os seus finalistas e só entram UFs com 2º turno", () => {
    const ac = disputa("Governador", "AC", [c(1, "Mailza", 40), c(2, "Alan", 42)], [c(1, "Mailza", 51), c(2, "Alan", 49)]);
    const semSegundo = disputa("Governador", "SP", [c(9, "Tarcisio", 58)], null);
    const linhas = linhasPorUf([ac, semSegundo], "Governador");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ uf: "AC", virada: true, a: { nome: "Mailza" }, b: { nome: "Alan" } });
  });

  it("ignora UF em que um finalista nacional não aparece", () => {
    const estranha = disputa("Presidente", "RJ", [c(13, "Lula", 40)], [c(13, "Lula", 50)]);
    expect(linhasPorUf([br, estranha], "Presidente")).toEqual([]);
  });
});
