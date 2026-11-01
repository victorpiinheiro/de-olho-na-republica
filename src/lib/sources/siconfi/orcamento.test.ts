import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toDespesas } from "./orcamento";
import { despesasSchema } from "./schemas";

// Fixture: resposta real do Siconfi (RREO-Anexo 02, União, 2025, 6º bimestre), só o bloco e as 4 colunas usadas.
const linhas = despesasSchema.parse(JSON.parse(readFileSync(join(__dirname, "fixtures", "rreo2-uniao-2025-b6.json"), "utf8"))).items;
const orc = toDespesas(linhas, 2025, 6);
const funcao = (nome: string) => orc.linhas.find((l) => l.funcao === nome && l.subfuncao === "")!;
const bi = (n: number | null) => Math.round((n ?? 0) / 1e9);

describe("toDespesas (dados reais)", () => {
  it("lê o total executado do ano: R$ 3.705 bi liquidados", () => {
    expect(bi(orc.total.liquidado)).toBe(3705);
    expect(bi(orc.total.dotacaoAtualizada)).toBeGreaterThan(3705);
  });

  it("lê as 29 funções, na ordem oficial", () => {
    const funcoes = orc.linhas.filter((l) => l.subfuncao === "");
    expect(funcoes).toHaveLength(29);
    expect(funcoes[0].funcao).toBe("Legislativa");
    expect(funcoes[funcoes.length - 1].funcao).toBe("Reserva de Contingência");
  });

  it("valores das maiores funções (R$ bi liquidados)", () => {
    expect(bi(funcao("Previdência Social").liquidado)).toBe(1101);
    expect(bi(funcao("Encargos Especiais").liquidado)).toBe(1511);
    expect(bi(funcao("Saúde").liquidado)).toBe(217);
    expect(bi(funcao("Educação").liquidado)).toBe(157);
  });

  it("separa função de subfunção (Saúde tem Atenção Básica; Encargos tem a dívida)", () => {
    const subs = (f: string) => orc.linhas.filter((l) => l.funcao === f && l.subfuncao !== "").map((l) => l.subfuncao);
    expect(subs("Saúde")).toContain("Atenção Básica");
    expect(subs("Encargos Especiais")).toEqual(
      expect.arrayContaining(["Serviço da Dívida Interna", "Serviço da Dívida Externa", "Transferências"]),
    );
  });

  it("não deixa as linhas de intra-orçamentárias e total geral entrarem como subfunção", () => {
    expect(orc.linhas.some((l) => l.subfuncao.startsWith("DESPESAS (INTRA") || l.subfuncao.startsWith("TOTAL"))).toBe(false);
  });

  it("Reserva de Contingência só tem dotação (sem execução)", () => {
    const r = funcao("Reserva de Contingência");
    expect(bi(r.dotacaoAtualizada)).toBeGreaterThan(0);
    expect(r.liquidado).toBeNull();
  });
});

describe("validações", () => {
  it("rejeita resposta de outro período", () => {
    expect(() => toDespesas(linhas, 2025, 5)).toThrow(/esperava 2025\/5/);
  });

  it("rejeita se um valor de subfunção for alterado (a soma deixa de bater)", () => {
    const alterado = linhas.map((l) =>
      l.conta === "Atenção Básica" && l.coluna.startsWith("DESPESAS LIQUIDADAS ATÉ") ? { ...l, valor: (l.valor ?? 0) + 5e9 } : l,
    );
    expect(() => toDespesas(alterado, 2025, 6)).toThrow(/Saúde \(liquidado\)/);
  });

  it("rejeita se uma função nova aparecer (viraria subfunção e quebraria a soma)", () => {
    const novo = linhas.map((l) => (l.conta === "Desporto e Lazer" ? { ...l, conta: "Função Nova" } : l));
    expect(() => toDespesas(novo, 2025, 6)).toThrow(/subfunções somam|funções \(/);
  });

  it("rejeita coluna renomeada na fonte", () => {
    const sem = linhas.map((l) => (l.coluna.startsWith("DESPESAS LIQUIDADAS") ? { ...l, coluna: "LIQUIDADO" } : l));
    expect(() => toDespesas(sem, 2025, 6)).toThrow(/coluna ausente/);
  });

  it("rejeita conta repetida", () => {
    const dup = [...linhas, linhas.find((l) => l.conta === "Saúde" && l.coluna.startsWith("DESPESAS LIQUIDADAS"))!];
    expect(() => toDespesas(dup, 2025, 6)).toThrow(/conta repetida/);
  });
});
