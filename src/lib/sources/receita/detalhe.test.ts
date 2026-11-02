import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerTabelaI, lerTabelaVII } from "./detalhe";

// Fixtures: páginas reais (pdftotext -layout) dos relatórios de set/2026 e jan/2026 da Receita.
const ler = (nome: string) => readFileSync(join(__dirname, "fixtures", nome), "utf8");
const set = lerTabelaI(ler("tabela-i-set-2026.txt"));
const jan = lerTabelaI(ler("tabela-i-jan-2026.txt"));
const achar = (t: typeof set, codigo: string) => t.linhas.find((l) => l.codigo === codigo)!;

describe("lerTabelaI", () => {
  it("identifica as 3 colunas: mês do relatório, mês anterior e mesmo mês do ano anterior", () => {
    expect(set.colunas).toEqual([{ ano: 2026, mes: 9 }, { ano: 2026, mes: 8 }, { ano: 2025, mes: 9 }]);
  });

  it("em janeiro, o mês anterior é dezembro do ano passado", () => {
    expect(jan.colunas).toEqual([{ ano: 2026, mes: 1 }, { ano: 2025, mes: 12 }, { ano: 2025, mes: 1 }]);
  });

  it("lê valores em R$ (a fonte vem em milhões)", () => {
    expect(achar(set, "importacao").valores).toEqual([9779e6, 8787e6, 7744e6]);
    expect(achar(set, "irpf").valores[0]).toBe(6079e6);
    expect(achar(set, "previdenciaria").valores[0]).toBe(64588e6);
  });

  it("monta a hierarquia pela indentação", () => {
    expect(achar(set, "irpj")).toMatchObject({ pai: "ir", nivel: 1 });
    expect(achar(set, "irrf-trabalho")).toMatchObject({ pai: "irrf", nivel: 2 });
    expect(achar(set, "ipi-fumo")).toMatchObject({ pai: "ipi", nivel: 1 });
    expect(achar(set, "ir")).toMatchObject({ pai: null, nivel: 0 });
  });

  it("'Entidades financeiras' e 'Demais empresas' levam o código do tributo pai", () => {
    for (const pai of ["irpj", "cofins", "pis", "csll"]) {
      expect(achar(set, `${pai}-financeiras`).pai).toBe(pai);
      expect(achar(set, `${pai}-demais`).pai).toBe(pai);
    }
  });

  it("os tributos de nível 0 mais a previdenciária somam o total das receitas administradas pela RFB", () => {
    const topo = set.linhas.filter((l) => l.nivel === 0).reduce((s, l) => s + l.valores[0], 0);
    expect(Math.abs(topo / 1e6 - 231426)).toBeLessThanOrEqual(3);
  });

  it("não repete código", () => {
    const codigos = set.linhas.map((l) => l.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("falha se aparecer um tributo que não conhecemos", () => {
    const alterada = ler("tabela-i-set-2026.txt").replace("CIDE-COMBUSTÍVEIS", "TRIBUTO NOVO");
    expect(() => lerTabelaI(alterada)).toThrow(/desconhecido/);
  });

  it("falha se uma parte não fechar com o total", () => {
    const alterada = ler("tabela-i-set-2026.txt").replace(/(I\.RENDA-PESSOA FÍSICA\s+)6\.079/, "$19.079");
    expect(() => lerTabelaI(alterada)).toThrow(/partes somam/);
  });

  it("falha se o cabeçalho de colunas mudar", () => {
    const alterada = ler("tabela-i-set-2026.txt").replace(/SETEMBRO(\s+)AGOSTO(\s+)SETEMBRO/, "SETEMBRO$1JULHO$2SETEMBRO");
    expect(() => lerTabelaI(alterada)).toThrow(/colunas da Tabela I inesperadas/);
  });
});

describe("lerTabelaVII", () => {
  const anos = lerTabelaVII(ler("tabela-vii-set-2026.txt"));
  const a2025 = anos.find((a) => a.ano === 2025)!;

  it("lê os anos de 2007 a 2026", () => {
    expect(anos[0].ano).toBe(2007);
    expect(anos[anos.length - 1].ano).toBe(2026);
    expect(anos).toHaveLength(20);
  });

  it("converte as 5 categorias oficiais para R$ e fecham com o total", () => {
    expect(a2025.valores["Renda e propriedade"]).toBe(1104379e6);
    expect(a2025.valores["Folha de salários"]).toBe(785220e6);
    expect(a2025.total).toBe(2763262e6);
  });

  it("falha se o cabeçalho mudar", () => {
    expect(() => lerTabelaVII(ler("tabela-vii-set-2026.txt").replace("FOLHA DE SALÁRIOS", "FOLHA"))).toThrow(/layout mudou/);
  });
});
