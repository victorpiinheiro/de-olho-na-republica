import { describe, expect, it } from "vitest";
import { paginar } from "./paginacao";
import { filtrarOrdenar, resumir, type Filtros, type LinhaRanking } from "./ranking";

const l = (id: number, nome: string, uf: string, partido: string, gasto: number, ativo = true) =>
  ({ id, nome, uf, partido, gasto, ativo, notas: 1, fotoUrl: null, maiorCategoria: null, votou: 0 }) satisfies LinhaRanking;

const linhas = [
  l(1, "João Álvares", "SP", "A", 300),
  l(2, "Maria Souza", "RJ", "B", 500),
  l(3, "Zé Pereira", "SP", "B", 100),
  l(4, "Ana Lima", "SP", "A", 900, false),
];
const base: Filtros = { busca: "", uf: "", partido: "", situacao: "ativos", ordem: "gasto-desc" };

describe("filtrarOrdenar", () => {
  it("oculta quem está fora de exercício por padrão e ordena por gasto", () => {
    expect(filtrarOrdenar(linhas, base).map((x) => x.id)).toEqual([2, 1, 3]);
  });
  it("inclui todos quando pedido", () => {
    expect(filtrarOrdenar(linhas, { ...base, situacao: "todos" })[0]?.id).toBe(4);
  });
  it("filtra por UF e partido", () => {
    expect(filtrarOrdenar(linhas, { ...base, uf: "SP", partido: "A" }).map((x) => x.id)).toEqual([1]);
  });
  it("busca ignorando acento e caixa", () => {
    expect(filtrarOrdenar(linhas, { ...base, busca: "joao alv" }).map((x) => x.id)).toEqual([1]);
  });
  it("ordena por nome em pt-BR", () => {
    expect(filtrarOrdenar(linhas, { ...base, ordem: "nome", situacao: "todos" }).map((x) => x.id))
      .toEqual([4, 1, 2, 3]);
  });
  it("não altera o array original", () => {
    const copia = [...linhas];
    filtrarOrdenar(linhas, { ...base, ordem: "nome" });
    expect(linhas).toEqual(copia);
  });
});

describe("resumir", () => {
  it("soma, conta e tira a média", () => {
    expect(resumir(linhas.slice(0, 3))).toEqual({ total: 900, quantidade: 3, media: 300 });
  });
  it("lista vazia não divide por zero", () => {
    expect(resumir([])).toEqual({ total: 0, quantidade: 0, media: 0 });
  });
});

describe("paginar", () => {
  const itens = Array.from({ length: 53 }, (_, i) => i);
  it("devolve a página pedida", () => {
    const p = paginar(itens, 3, 25);
    expect(p.itens).toHaveLength(3);
    expect(p.totalPaginas).toBe(3);
  });
  it("limita páginas fora do intervalo", () => {
    expect(paginar(itens, 99, 25).pagina).toBe(3);
    expect(paginar(itens, 0, 25).pagina).toBe(1);
    expect(paginar(itens, Number.NaN, 25).pagina).toBe(1);
  });
  it("lista vazia tem 1 página", () => {
    expect(paginar([], 1, 25)).toEqual({ itens: [], pagina: 1, totalPaginas: 1 });
  });
});
