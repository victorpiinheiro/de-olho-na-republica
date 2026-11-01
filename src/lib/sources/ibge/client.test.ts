import { describe, expect, it } from "vitest";
import { toPopulacao } from "./client";

// Resposta real da API SIDRA (tabela 6579, variável 9324, Brasil).
const resposta = [
  {
    id: "9324",
    variavel: "População residente estimada",
    unidade: "Pessoas",
    resultados: [
      {
        classificacoes: [],
        series: [{ localidade: { id: "1", nome: "Brasil" }, serie: { "2026": "214211951" } }],
      },
    ],
  },
];

describe("toPopulacao", () => {
  it("lê ano e população", () => {
    expect(toPopulacao(resposta)).toEqual({ ano: 2026, pessoas: 214211951 });
  });
  it("quebra se o formato mudar", () => {
    expect(() => toPopulacao([{ resultados: [] }])).toThrow();
    expect(() => toPopulacao([{ ...resposta[0], resultados: [{ series: [{ serie: { "2026": "214.211.951" } }] }] }])).toThrow();
  });
});
