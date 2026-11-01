import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerTabelaMensal, paginaDaTabela, toArrecadacoes, TRIBUTOS } from "./adapter";
import { urlDaAnalise } from "./client";
import { milhoesBr } from "./schemas";

// Fixtures: páginas reais (pdftotext -layout) do relatório de set/2026 da Receita.
const ler = (nome: string) => readFileSync(join(__dirname, "fixtures", nome), "utf8");
const correntes = lerTabelaMensal(ler("tabela-iii.txt"));
const constantes = lerTabelaMensal(ler("tabela-iii-a.txt"));

describe("milhoesBr", () => {
  it.each([
    ["1.792.027", 1792027],
    ["966", 966],
    ["(1.234)", -1234],
  ])("%s → %d", (s, n) => expect(milhoesBr.parse(s)).toBe(n));
  it("rejeita formato fora do padrão", () => expect(() => milhoesBr.parse("1,5")).toThrow());
});

describe("paginaDaTabela", () => {
  it("não confunde TABELA III com TABELA III-A", () => {
    const tudo = [ler("tabela-iii-a.txt"), ler("tabela-iii.txt")].join("\f");
    expect(paginaDaTabela(tudo, "TABELA III")).toContain("A PREÇOS CORRENTES");
    expect(paginaDaTabela(tudo, "TABELA III-A")).toContain("IPCA");
  });
  it("falha se a tabela não existir", () => {
    expect(() => paginaDaTabela("nada aqui", "TABELA III")).toThrow(/não encontrada/);
  });
});

describe("lerTabelaMensal", () => {
  it("lê os anos de 2021 a 2026, com 2026 parcial (jan-set)", () => {
    expect(correntes.map((a) => a.ano)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
    expect(correntes.slice(0, 5).every((a) => a.meses.length === 12)).toBe(true);
    expect(correntes[5].meses).toHaveLength(9);
  });

  it("atribui cada bloco ao ano que vem depois dele", () => {
    // JAN/2026: I. Renda 123.764, Contribuições 96.145, Total RFB 313.201
    const jan26 = correntes[5].meses[0];
    expect([jan26[0], jan26[3], jan26[6]]).toEqual([123764, 96145, 313201]);
    // JAN/2021: I. Renda 66.599
    expect(correntes[0].meses[0][0]).toBe(66599);
  });

  it("a tabela a preços constantes tem os mesmos anos e meses", () => {
    expect(constantes.map((a) => [a.ano, a.meses.length])).toEqual(correntes.map((a) => [a.ano, a.meses.length]));
    expect(constantes[5].meses[0][0]).toBe(128231);
  });

  it("rejeita se uma linha de mês for alterada (soma não bate)", () => {
    const adulterado = ler("tabela-iii.txt").replace("123.764", "999.999");
    expect(() => lerTabelaMensal(adulterado)).toThrow(/categorias somam/);
  });

  it("rejeita se o cabeçalho mudar", () => {
    const sem = ler("tabela-iii.txt").replace(/Previdenciária/g, "Outra coisa");
    expect(() => lerTabelaMensal(sem)).toThrow(/layout mudou/);
  });

  it("rejeita se faltar um mês (soma anual não bate)", () => {
    const sem = ler("tabela-iii.txt").replace(/^\s*FEV\s+35\.476.*\n/m, "");
    expect(() => lerTabelaMensal(sem)).toThrow();
  });
});

describe("toArrecadacoes", () => {
  const linhas = toArrecadacoes(correntes, constantes, [2025, 2026]);

  it("gera 6 tributos por mês: 12 meses de 2025 + 9 de 2026", () => {
    expect(linhas).toHaveLength(6 * (12 + 9));
    expect(new Set(linhas.map((l) => l.tributo))).toEqual(new Set(TRIBUTOS));
  });

  it("converte R$ milhões em R$ e guarda o valor real", () => {
    expect(linhas.find((l) => l.ano === 2026 && l.mes === 1 && l.tributo === "Imposto de Renda")).toEqual({
      esfera: "FEDERAL",
      tributo: "Imposto de Renda",
      ano: 2026,
      mes: 1,
      valor: 123764_000_000,
      estimado: false,
      valorReal: 128231_000_000,
    });
  });

  it("falha se faltar o ano pedido", () => {
    expect(() => toArrecadacoes(correntes, constantes, [2030])).toThrow(/ausente/);
  });
});

describe("urlDaAnalise", () => {
  it("monta a URL com mês abreviado", () => {
    expect(urlDaAnalise("https://x/{ano}/analise-mensal-{mes}-{ano}.pdf", 2026, 9)).toBe(
      "https://x/2026/analise-mensal-set-2026.pdf",
    );
  });
});
