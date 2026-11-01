import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bimestreParaMeses, receitaDoBimestre } from "./adapter";
import { rreoSchema } from "./schemas";

// Fixtures: respostas reais do Siconfi (RREO-Anexo 01, estado de SP, 2025), só com as contas usadas.
const ler = (nome: string) => rreoSchema.parse(JSON.parse(readFileSync(join(__dirname, "fixtures", nome), "utf8"))).items;
const b6 = ler("rreo-sp-2025-b6.json");
const b5 = ler("rreo-sp-2025-b5.json");

describe("receitaDoBimestre", () => {
  it("lê Impostos e Taxas da coluna 'No Bimestre (b)'", () => {
    expect(receitaDoBimestre(b6, 2025, 6)).toEqual({ Impostos: 44791860467.47, Taxas: 2467467700.68 });
  });

  it("o bimestre é o acumulado menos o acumulado do bimestre anterior", () => {
    // 'Até o Bimestre (c)': 254.156.899.493,93 (b6) − 209.365.039.026,46 (b5) = 44.791.860.467,47
    expect(Math.round((254156899493.93 - 209365039026.46) * 100) / 100).toBe(receitaDoBimestre(b6, 2025, 6).Impostos);
    expect(receitaDoBimestre(b5, 2025, 5).Impostos).toBe(40846246239.02);
  });

  it("rejeita resposta de outro período", () => {
    expect(() => receitaDoBimestre(b5, 2025, 6)).toThrow(/esperava 2025\/6/);
  });

  it("rejeita se a coluna for renomeada na fonte", () => {
    const renomeada = b6.map((l) => (l.coluna === "No Bimestre (b)" ? { ...l, coluna: "No Período (b)" } : l));
    expect(() => receitaDoBimestre(renomeada, 2025, 6)).toThrow(/esperava 1 linha, vieram 0/);
  });

  it("rejeita conta duplicada e valor nulo", () => {
    const dup = [...b6, b6.find((l) => l.cod_conta === "Impostos" && l.coluna === "No Bimestre (b)")!];
    expect(() => receitaDoBimestre(dup, 2025, 6)).toThrow(/vieram 2/);
    const nulo = b6.map((l) => (l.cod_conta === "Taxas" && l.coluna === "No Bimestre (b)" ? { ...l, valor: null } : l));
    expect(() => receitaDoBimestre(nulo, 2025, 6)).toThrow(/valor nulo/);
  });
});

describe("schema", () => {
  it("quebra se um campo usado sumir", () => {
    const semColuna = { ...JSON.parse(readFileSync(join(__dirname, "fixtures", "rreo-sp-2025-b5.json"), "utf8")).items[0], coluna: undefined };
    expect(() => rreoSchema.parse({ items: [semColuna], hasMore: false })).toThrow();
  });
});

describe("bimestreParaMeses", () => {
  const linhas = bimestreParaMeses("SP", 2025, 6, receitaDoBimestre(b6, 2025, 6));

  it("divide o bimestre em dois meses (nov e dez) e a soma fecha", () => {
    const imp = linhas.filter((l) => l.tributo === "Impostos estaduais");
    expect(imp.map((l) => l.mes)).toEqual([11, 12]);
    expect(Math.round((imp[0].valor + imp[1].valor) * 100) / 100).toBe(44791860467.47);
  });

  it("é oficial, estadual (com a UF) e sem valor real (não há IPCA na fonte)", () => {
    expect(linhas).toHaveLength(4);
    expect(linhas.every((l) => l.esfera === "ESTADUAL" && l.uf === "SP" && !l.estimado && l.valorReal === null && l.ano === 2025)).toBe(true);
  });

  it("o resto do arredondamento vai para o segundo mês", () => {
    const [a, b] = bimestreParaMeses("SP", 2025, 1, { Impostos: 0.03, Taxas: 0 }).filter((l) => l.tributo === "Impostos estaduais");
    expect([a.mes, a.valor, b.mes, b.valor]).toEqual([1, 0.02, 2, 0.01]);
  });
});
