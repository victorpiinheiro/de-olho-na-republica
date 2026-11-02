import { describe, expect, it } from "vitest";
import { arvoreEstadual, arvoreFederal, categoriasEstadual, type DetalheEstadualDados, type DetalheFederalDados } from "./detalhe";

const federal: DetalheFederalDados = {
  ano: 2026,
  ultimoMes: 2,
  tributos: [
    { codigo: "ir", nome: "Imposto de Renda", pai: null, nivel: 0 },
    { codigo: "irpf", nome: "Pessoa física", pai: "ir", nivel: 1 },
    { codigo: "irpj", nome: "Pessoa jurídica", pai: "ir", nivel: 1 },
    { codigo: "cofins", nome: "COFINS", pai: null, nivel: 0 },
  ],
  valores: [
    [2025, 1, 0, 100], [2025, 1, 1, 40], [2025, 1, 2, 60], [2025, 1, 3, 300],
    [2025, 2, 0, 110], [2025, 2, 1, 50], [2025, 2, 2, 60], [2025, 2, 3, 310],
    [2026, 1, 0, 120], [2026, 1, 1, 50], [2026, 1, 2, 70], [2026, 1, 3, 330],
    [2026, 2, 0, 130], [2026, 2, 1, 60], [2026, 2, 2, 70], [2026, 2, 3, 340],
  ],
  base: [],
};

describe("arvoreFederal", () => {
  it("soma os meses do recorte e ordena do maior para o menor", () => {
    const a = arvoreFederal(federal, 2026, [1, 2]);
    expect(a.nos.map((n) => n.codigo)).toEqual(["cofins", "ir"]);
    expect(a.nos[0].valor).toBe(670);
    expect(a.nos[1].valor).toBe(250);
    expect(a.total).toBe(920);
  });

  it("aninha as partes dentro do tributo", () => {
    const ir = arvoreFederal(federal, 2026, [1]).nos.find((n) => n.codigo === "ir")!;
    expect(ir.filhos.map((f) => [f.codigo, f.valor])).toEqual([["irpj", 70], ["irpf", 50]]);
  });

  it("compara com o mesmo período do ano anterior quando ele existe por inteiro", () => {
    const a = arvoreFederal(federal, 2026, [1, 2]);
    expect(a.totalAnterior).toBe(100 + 300 + 110 + 310);
    expect(a.nos.find((n) => n.codigo === "ir")!.anterior).toBe(210);
  });

  it("sem o ano anterior inteiro não compara (evita comparar períodos diferentes)", () => {
    expect(arvoreFederal(federal, 2026, [1, 2, 3]).totalAnterior).toBeNull();
    expect(arvoreFederal(federal, 2025, [1]).totalAnterior).toBeNull();
  });
});

// Mesma estrutura da DCA: total (nível 0), impostos e taxas (nível 1), grupos e contas abaixo.
const contas: DetalheEstadualDados["contas"] = [
  { cod: "RO1.1.0.0.00.0.0", nome: "Impostos, Taxas e Contribuições de Melhoria", nivel: 0 },
  { cod: "RO1.1.1.0.00.0.0", nome: "Impostos", nivel: 1 },
  { cod: "RO1.1.1.2.00.0.0", nome: "Impostos sobre o Patrimônio", nivel: 2 },
  { cod: "RO1.1.1.2.51.0.0", nome: "Imposto sobre a Propriedade de Veículos Automotores", nivel: 3 },
  { cod: "RO1.1.1.4.00.0.0", nome: "Impostos sobre a Produção e Circulação", nivel: 2 },
  { cod: "RO1.1.1.4.50.0.0", nome: "Impostos sobre a Produção e Circulação", nivel: 3 },
  { cod: "RO1.1.1.4.50.1.0", nome: "Imposto sobre Operações Relativas à Circulação de Mercadorias", nivel: 4 },
  { cod: "RO1.1.2.0.00.0.0", nome: "Taxas", nivel: 1 },
  { cod: "RO1.1.3.0.00.0.0", nome: "Contribuição de Melhoria", nivel: 1 },
];
const estadual: DetalheEstadualDados = {
  anos: [2025],
  contas,
  valores: [
    // [ano, uf, conta, bruto, fundeb, transferências, outras]
    [2025, "SP", 0, 1000, 100, 150, 0],
    [2025, "SP", 1, 900, 100, 150, 0],
    [2025, "SP", 2, 100, 10, 40, 0],
    [2025, "SP", 3, 100, 10, 40, 0],
    [2025, "SP", 4, 800, 90, 110, 0],
    [2025, "SP", 5, 800, 90, 110, 0],
    [2025, "SP", 6, 800, 90, 110, 0],
    [2025, "SP", 7, 100, 0, 0, 0],
    [2025, "MG", 0, 500, 0, 0, 0],
    [2025, "MG", 1, 450, 0, 0, 0],
    [2025, "MG", 4, 450, 0, 0, 0],
    [2025, "MG", 5, 450, 0, 0, 0],
    [2025, "MG", 6, 450, 0, 0, 0],
    [2025, "MG", 7, 50, 0, 0, 0],
  ],
};

describe("arvoreEstadual", () => {
  const todos = arvoreEstadual(estadual, 2025, null, 0);

  it("soma os estados e separa bruto, deduções e líquido", () => {
    expect(todos.bruto).toBe(1500);
    expect(todos.deducoes).toBe(250); // SP: 100 de FUNDEB + 150 de repasses, só nos impostos
    expect(todos.liquido).toBe(1250);
    expect(todos.nos.map((n) => n.nome)).toEqual(["Impostos", "Taxas"]);
  });

  it("filtra pelos estados escolhidos", () => {
    const so = arvoreEstadual(estadual, 2025, new Set(["MG"]), 0);
    expect(so.bruto).toBe(500);
    expect(so.deducoes).toBe(0);
  });

  it("usa nomes curtos (ICMS, IPVA) e junta a conta que só repete o pai", () => {
    const impostos = todos.nos[0];
    // 1.1.1.4.00 → 4.50 → ICMS: cada um tem um só filho com o mesmo valor, então aparece direto o ICMS
    expect(impostos.filhos.find((f) => f.nome === "ICMS")!.bruto).toBe(1250);
    expect(impostos.filhos.some((f) => f.nome.startsWith("Impostos sobre a Produção"))).toBe(false);
    expect(impostos.filhos.find((f) => f.nome === "Impostos sobre o Patrimônio")).toBeUndefined();
    expect(impostos.filhos.map((f) => f.nome).sort()).toEqual(["ICMS", "IPVA"]);
  });

  it("some a conta sem valor (contribuição de melhoria zerada)", () => {
    expect(todos.nos.some((n) => n.nome === "Contribuição de Melhoria")).toBe(false);
  });
});

describe("arvoreEstadual: nível repetido e itens pequenos", () => {
  const c = (cod: string, nome: string, nivel: number) => ({ cod, nome, nivel });
  const dados: DetalheEstadualDados = {
    anos: [2025],
    contas: [
      c("RO1.1.0.0.00.0.0", "Total", 0),
      c("RO1.1.1.0.00.0.0", "Impostos", 1),
      c("RO1.1.1.4.00.0.0", "Produção e circulação", 2),
      c("RO1.1.1.4.50.0.0", "Produção e circulação", 3), // mesmo nome do pai
      c("RO1.1.1.4.50.1.0", "Imposto sobre Operações Relativas à Circulação de Mercadorias", 4),
      c("RO1.1.1.4.50.2.0", "Adicional ICMS - Fundo de Combate à Pobreza", 4),
      c("RO1.1.1.4.51.0.0", "Impostos sobre Serviços", 3),
      c("RO1.1.1.4.51.1.0", "ISSQN", 4),
      c("RO1.1.1.9.00.0.0", "Outros Impostos A", 2),
      c("RO1.1.1.9.01.0.0", "Pequeno 1", 3),
      c("RO1.1.1.9.02.0.0", "Pequeno 2", 3),
    ],
    valores: [
      [2025, "SP", 0, 100_000, 0, 0, 0],
      [2025, "SP", 1, 100_000, 0, 0, 0],
      [2025, "SP", 2, 99_900, 0, 0, 0],
      [2025, "SP", 3, 90_000, 0, 0, 0],
      [2025, "SP", 4, 80_000, 0, 0, 0],
      [2025, "SP", 5, 10_000, 0, 0, 0],
      [2025, "SP", 6, 9_900, 0, 0, 0],
      [2025, "SP", 7, 9_900, 0, 0, 0],
      [2025, "SP", 8, 100, 0, 0, 0],
      [2025, "SP", 9, 60, 0, 0, 0],
      [2025, "SP", 10, 40, 0, 0, 0],
    ],
  };
  const arv = arvoreEstadual(dados, 2025, null, 0);
  const impostos = arv.nos[0];

  it("o nível que repete o nome do pai some e as partes dele sobem", () => {
    const producao = impostos.filhos.find((f) => f.nome === "Produção e circulação")!;
    expect(producao.filhos.map((f) => f.nome)).toEqual(["ICMS", "Adicional de ICMS (combate à pobreza)", "ISS (Distrito Federal)"]);
    expect(producao.filhos.map((f) => f.bruto)).toEqual([80_000, 10_000, 9_900]);
    expect(producao.filhos.reduce((s, f) => s + f.bruto, 0)).toBe(producao.bruto);
  });

  it("agrupa em 'Demais itens' os que valem menos de 0,1% do total, sem perder valor", () => {
    const outros = impostos.filhos.find((f) => f.nome === "Outros Impostos A")!;
    expect(outros.filhos.map((f) => f.nome)).toEqual(["Demais itens"]);
    expect(outros.filhos[0].bruto).toBe(100);
  });

  it("um único item pequeno fica como está", () => {
    const um: DetalheEstadualDados = { ...dados, valores: dados.valores.filter((v) => v[2] !== 10) };
    const outros = arvoreEstadual(um, 2025, null, 0).nos[0].filhos.find((f) => f.nome === "Outros Impostos A")!;
    expect(outros.filhos.map((f) => f.nome)).toEqual(["Pequeno 1"]);
  });
});

describe("arvoreEstadual: valor mínimo", () => {
  it("não mostra conta com só alguns reais (padrão: abaixo de R$ 1.000), mas o total não muda", () => {
    const d: DetalheEstadualDados = {
      anos: [2025],
      contas: [
        { cod: "RO1.1.0.0.00.0.0", nome: "Total", nivel: 0 },
        { cod: "RO1.1.1.0.00.0.0", nome: "Impostos", nivel: 1 },
        { cod: "RO1.1.3.0.00.0.0", nome: "Contribuição de Melhoria", nivel: 1 },
      ],
      valores: [[2025, "DF", 0, 5e9 + 66, 0, 0, 0], [2025, "DF", 1, 5e9, 0, 0, 0], [2025, "DF", 2, 66, 0, 0, 0]],
    };
    const a = arvoreEstadual(d, 2025, null);
    expect(a.nos.map((n) => n.nome)).toEqual(["Impostos"]);
  });
});

describe("categoriasEstadual", () => {
  it("ICMS é bens e serviços; IPVA é renda e propriedade; taxas são outros", () => {
    const c = Object.fromEntries(categoriasEstadual(estadual, 2025, null).map((x) => [x.categoria, x.valor]));
    expect(c["Bens e serviços"]).toBe(1250);
    expect(c["Renda e propriedade"]).toBe(100);
    expect(c["Outros"]).toBe(150);
  });

  it("as categorias somam o total bruto de impostos e taxas", () => {
    const soma = categoriasEstadual(estadual, 2025, null).reduce((s, x) => s + x.valor, 0);
    expect(soma).toBe(arvoreEstadual(estadual, 2025, null, 0).bruto);
  });
});
