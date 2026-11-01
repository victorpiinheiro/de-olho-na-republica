import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { juntarMandatos, qid, toPresidentes } from "./adapter";
import { mandatosSchema, partidosSchema } from "./schemas";

// Fixtures: respostas reais do Wikidata (SPARQL) em 01/11/2026.
const ler = (nome: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", nome), "utf8"));
const mandatos = mandatosSchema.parse(ler("mandatos.json")).results.bindings;
const partidos = partidosSchema.parse(ler("partidos.json")).results.bindings;
const presidentes = toPresidentes(mandatos, partidos);
const por = (nome: string) => presidentes.find((p) => p.nome === nome)!;

describe("toPresidentes (dados reais)", () => {
  it("devolve as 36 pessoas, de Deodoro ao atual, em ordem cronológica", () => {
    expect(presidentes).toHaveLength(36);
    expect(presidentes[0].nome).toBe("Deodoro da Fonseca");
    expect(presidentes[0].mandatos[0]).toEqual({ inicio: "1889-11-15", fim: "1891-11-23" });
    const inicios = presidentes.map((p) => p.mandatos[0].inicio);
    expect([...inicios].sort()).toEqual(inicios);
  });

  it("junta mandatos seguidos: FHC e Dilma viram um período, Lula fica com dois", () => {
    expect(por("Fernando Henrique Cardoso").mandatos).toEqual([{ inicio: "1995-01-01", fim: "2003-01-01" }]);
    expect(por("Dilma Rousseff").mandatos).toEqual([{ inicio: "2011-01-01", fim: "2016-08-31" }]);
    expect(por("Luiz Inácio Lula da Silva").mandatos).toEqual([
      { inicio: "2003-01-01", fim: "2011-01-01" },
      { inicio: "2023-01-01", fim: null },
    ]);
  });

  it("mantém separados os mandatos com intervalo (Vargas e Mazzilli)", () => {
    expect(por("Getúlio Vargas").mandatos).toHaveLength(2);
    expect(por("Ranieri Mazzilli").mandatos).toHaveLength(2);
  });

  it("não traz a eleição de 1998 nem juntas (não são pessoas)", () => {
    expect(presidentes.some((p) => /Eleição|Junta/.test(p.nome))).toBe(false);
  });

  it("tem um único mandato em exercício", () => {
    expect(presidentes.flatMap((p) => p.mandatos).filter((m) => m.fim === null)).toHaveLength(1);
  });

  it("guarda todas as filiações (Collor tem várias; JK tem uma)", () => {
    expect(por("Fernando Collor").partidos.length).toBeGreaterThan(1);
    expect(por("Juscelino Kubitschek").partidos).toHaveLength(1);
  });
});

describe("juntarMandatos", () => {
  it("encosta com até 1 dia de diferença, mas não com mais", () => {
    expect(juntarMandatos([{ inicio: "2011-01-01", fim: "2014-12-31" }, { inicio: "2015-01-01", fim: "2016-08-31" }])).toEqual([
      { inicio: "2011-01-01", fim: "2016-08-31" },
    ]);
    expect(juntarMandatos([{ inicio: "1961-08-25", fim: "1961-09-07" }, { inicio: "1964-04-02", fim: "1964-04-15" }])).toHaveLength(2);
  });
  it("remove duplicatas do mesmo início", () => {
    expect(juntarMandatos([{ inicio: "2019-01-01", fim: "2023-01-01" }, { inicio: "2019-01-01", fim: "2023-01-01" }])).toHaveLength(1);
  });
});

describe("validações", () => {
  it("falha se vierem poucos presidentes", () => {
    expect(() => toPresidentes(mandatos.slice(0, 5), partidos)).toThrow(/consulta incompleta/);
  });
  it("falha com URI inesperada", () => {
    expect(() => qid("http://exemplo.org/x")).toThrow(/URI/);
  });
  it("quebra se uma variável da consulta sumir", () => {
    const semInicio = { ...ler("mandatos.json").results.bindings[0], inicio: undefined };
    expect(() => mandatosSchema.parse({ results: { bindings: [semInicio] } })).toThrow();
  });
});
