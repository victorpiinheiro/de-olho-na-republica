import { describe, expect, it } from "vitest";
import { duracaoTexto, iniciais, periodoDe } from "./historia";

describe("periodoDe", () => {
  it.each([
    ["1889-11-15", "República Velha"],
    ["1930-10-23", "República Velha"],
    ["1930-10-24", "Era Vargas"],
    ["1945-10-29", "Era Vargas"], // Linhares
    ["1946-01-31", "República de 1946"], // Dutra
    ["1951-01-31", "República de 1946"], // Vargas, 2º período
    ["1964-03-31", "República de 1946"],
    ["1964-04-02", "Regime militar"], // Mazzilli
    ["1985-03-14", "Regime militar"],
    ["1985-03-15", "Nova República"], // Sarney
    ["2023-01-01", "Nova República"],
  ])("%s → %s", (data, nome) => expect(periodoDe(data).nome).toBe(nome));

  it("rejeita data anterior à República", () => {
    expect(() => periodoDe("1800-01-01")).toThrow(/anterior/);
  });
});

describe("duracaoTexto", () => {
  it.each([
    [2, "2 dias"],
    [1, "1 dia"],
    [75, "2 meses"],
    [1826, "5 anos"], // JK
    [929, "2 anos e 6 meses"], // Collor
    [400, "1 ano e 1 mês"],
  ])("%d dias → %s", (d, t) => expect(duracaoTexto(d)).toBe(t));
});

describe("iniciais", () => {
  it.each([
    ["Juscelino Kubitschek", "JK"],
    ["Deodoro da Fonseca", "DF"],
    ["Luiz Inácio Lula da Silva", "LS"],
    ["Fernando Henrique Cardoso", "FC"],
  ])("%s → %s", (n, i) => expect(iniciais(n)).toBe(i));
});
