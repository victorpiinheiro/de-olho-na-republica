import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { foiEleito, temSegundoTurno, toEleicao } from "./adapter";
import { catalogoSchema, resultadoSchema, type ResultadoApi } from "./schemas";

// Fixtures são respostas reais da API do TSE (ciclo 2026).
const ler = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", nome), "utf8"));
const resultado = (nome: string) => resultadoSchema.parse(ler(nome));

describe("catálogo", () => {
  it("aponta o código do 2º turno de Presidente e Governador", () => {
    const pl = catalogoSchema.parse(ler("catalogo.json")).pl.find((p) => p.c === "ele2026");
    const por = (cargo: string) =>
      pl?.e.find((e) => e.t === "1" && e.abr.some((a) => a.cp.some((c) => c.cd === cargo)));
    expect(por("1")).toMatchObject({ cd: "6257", cdt2: "6258" });
    expect(por("3")).toMatchObject({ cd: "6259", cdt2: "6260" });
  });
});

describe("toEleicao", () => {
  it("converte o 2º turno de Presidente no Brasil", () => {
    const { eleicao, candidatos } = toEleicao(resultado("presidente-br-2t.json"));
    expect(eleicao).toEqual({
      ano: 2026,
      turno: 2,
      cargo: "Presidente",
      uf: "BR",
      codigoTse: "6258",
      aptos: 158745502,
      comparecimento: 128236074,
      abstencoes: 30509005,
      votosBrancos: 1430496,
      votosNulos: 2723305,
      votosValidos: 124082273,
    });
    expect(candidatos).toEqual([
      { numero: 22, nome: "FLAVIO BOLSONARO", partido: "PL", votos: 59826041, percentual: 48.215, eleito: false },
      expect.objectContaining({ nome: "LULA", votos: 64256232, percentual: 51.785, eleito: true }),
    ]);
  });

  it("no 1º turno os finalistas (st '2º turno') não são eleitos", () => {
    const { candidatos } = toEleicao(resultado("presidente-br-1t.json"));
    expect(candidatos).toHaveLength(12);
    expect(candidatos.filter((c) => c.eleito)).toEqual([]);
  });

  it("converte uma UF e usa a sigla em maiúsculas", () => {
    const { eleicao } = toEleicao(resultado("presidente-sp-1t.json"));
    expect(eleicao).toMatchObject({ uf: "SP", cargo: "Presidente", turno: 1, aptos: 34122892 });
  });

  it("Governador eleito no 1º turno vem como eleito", () => {
    const { eleicao, candidatos } = toEleicao(resultado("governador-sp-1t.json"));
    expect(eleicao).toMatchObject({ cargo: "Governador", uf: "SP", codigoTse: "6259" });
    expect(candidatos.filter((c) => c.eleito)).toHaveLength(1);
  });

  it("rejeita quando a soma dos candidatos não bate com os votos válidos", () => {
    const r: ResultadoApi = structuredClone(resultado("presidente-br-2t.json"));
    r.v.vvc += 1;
    expect(() => toEleicao(r)).toThrow(/diferem dos votos válidos/);
  });

  it("rejeita candidatos com número repetido", () => {
    const r: ResultadoApi = structuredClone(resultado("presidente-br-2t.json"));
    const [par] = r.carg[0].agr[0].par;
    par.cand[0] = { ...par.cand[0], n: 13 };
    const outro = r.carg[0].agr[0].par[1] ?? par;
    outro.cand[outro.cand.length - 1].n = 13;
    expect(() => toEleicao(r)).toThrow();
  });
});

describe("temSegundoTurno", () => {
  it("é verdadeiro quando há finalistas no 1º turno", () => {
    expect(temSegundoTurno(resultado("governador-ac-1t.json"))).toBe(true);
    expect(temSegundoTurno(resultado("presidente-br-1t.json"))).toBe(true);
  });
  it("é falso quando o governador saiu eleito no 1º turno", () => {
    expect(temSegundoTurno(resultado("governador-sp-1t.json"))).toBe(false);
  });
});

describe("foiEleito", () => {
  it.each([
    ["Eleito", true],
    ["Eleito por QP", true],
    ["Eleito por média", true],
    ["Não eleito", false],
    ["2º turno", false],
  ])("%s → %s", (st, esperado) => expect(foiEleito(st)).toBe(esperado));
});

describe("schemas", () => {
  it("quebra se um campo numérico mudar de formato", () => {
    const bruto = structuredClone(ler("presidente-br-2t.json")) as { e: { te: string } };
    bruto.e.te = "158.745.502";
    expect(() => resultadoSchema.parse(bruto)).toThrow();
  });
});
