import { describe, expect, it } from "vitest";
import { calcular, granularidadesPermitidas, tributosDisponiveis, type Selecao, type SerieOficial } from "./oficial";

const meses = (v: number, ate: number): (number | null)[] => Array.from({ length: 12 }, (_, i) => (i < ate ? v : null));
const fed = (tributo: string, ano: number, v: number, ate: number): SerieOficial => ({
  esfera: "FEDERAL", uf: "BR", tributo, ano, valores: meses(v, ate), reais: meses(v * 1.1, ate),
});
const est = (uf: string, ano: number, v: number, ate: number): SerieOficial => ({
  esfera: "ESTADUAL", uf, tributo: "Impostos estaduais", ano, valores: meses(v, ate), reais: meses(0, 0).map(() => null),
});

// Federal publicado até set (9 meses); estadual até ago (8 meses = 4 bimestres). Ano anterior completo.
const series = [
  fed("IR", 2026, 100, 9), fed("IPI", 2026, 10, 9), fed("IR", 2025, 90, 12), fed("IPI", 2025, 10, 12),
  est("SP", 2026, 50, 8), est("MG", 2026, 20, 8), est("SP", 2025, 40, 12), est("MG", 2025, 20, 12),
];
const sel = (esfera: Selecao["esfera"], extra: Partial<Selecao> = {}): Selecao => ({ esfera, ufs: null, tributos: null, ...extra });

describe("granularidades", () => {
  it("estadual não tem mês", () => {
    expect(granularidadesPermitidas(series, sel("federal"))).toEqual(["mes", "bimestre", "acumulado"]);
    expect(granularidadesPermitidas(series, sel("estadual"))).toEqual(["bimestre", "acumulado"]);
    expect(granularidadesPermitidas(series, sel("total"))).toEqual(["bimestre", "acumulado"]);
  });
  it("pedir mês no estadual cai para bimestre", () => {
    expect(calcular(series, sel("estadual"), 2026, "mes", 3).granularidade).toBe("bimestre");
  });
  it("total sem tributos estaduais volta a permitir mês", () => {
    expect(granularidadesPermitidas(series, sel("total", { tributos: new Set(["IR"]) }))).toContain("mes");
  });
});

describe("federal por mês", () => {
  it("soma os tributos do mês e compara com o mesmo mês do ano anterior", () => {
    const r = calcular(series, sel("federal"), 2026, "mes", 3);
    expect(r.selecionado).toBe(3);
    expect(r.valor).toBe(110);
    expect(r.anterior).toBe(100);
    expect(r.variacao).toBeCloseTo(10);
    expect(r.variacaoReal).toBeCloseTo(10);
  });
  it("sem período pedido usa o último publicado (set)", () => {
    expect(calcular(series, sel("federal"), 2026, "mes", null).selecionado).toBe(9);
  });
  it("mês não publicado (out) cai no último publicado", () => {
    const r = calcular(series, sel("federal"), 2026, "mes", 10);
    expect(r.selecionado).toBe(9);
    expect(r.periodos[9].valor).toBeNull();
  });
});

describe("bimestre e acumulado", () => {
  it("bimestre soma dois meses", () => {
    expect(calcular(series, sel("federal"), 2026, "bimestre", 2).valor).toBe(220);
  });
  it("bimestre incompleto (5º: só set) não conta como publicado", () => {
    const r = calcular(series, sel("federal"), 2026, "bimestre", null);
    expect(r.selecionado).toBe(4);
    expect(r.periodos[4].valor).toBeNull();
  });
  it("acumulado federal vai até set e compara com jan–set do ano anterior", () => {
    const r = calcular(series, sel("federal"), 2026, "acumulado", null);
    expect(r.mesesCobertos).toHaveLength(9);
    expect(r.valor).toBe(990);
    expect(r.anterior).toBe(900);
  });
});

describe("total", () => {
  it("só soma o período que as duas fontes publicaram (jan–ago)", () => {
    const r = calcular(series, sel("total"), 2026, "acumulado", null);
    expect(r.mesesCobertos).toHaveLength(8);
    expect(r.valor).toBe(8 * (110 + 70));
    expect(r.variacaoReal).toBeNull(); // IPCA só existe no federal
  });
  it("bimestre 5 do total não existe (estadual ainda não publicou)", () => {
    expect(calcular(series, sel("total"), 2026, "bimestre", 5).selecionado).toBe(4);
  });
});

describe("filtros", () => {
  it("tirar SP muda o estadual", () => {
    const todas = calcular(series, sel("estadual"), 2026, "bimestre", 1).valor;
    const semSp = calcular(series, sel("estadual", { ufs: new Set(["MG"]) }), 2026, "bimestre", 1).valor;
    expect([todas, semSp]).toEqual([140, 40]);
  });
  it("filtro de tributo", () => {
    expect(calcular(series, sel("federal", { tributos: new Set(["IPI"]) }), 2026, "mes", 1).valor).toBe(10);
    expect(tributosDisponiveis(series, "federal").sort()).toEqual(["IPI", "IR"]);
    expect(tributosDisponiveis(series, "total")).toContain("Impostos estaduais");
  });
  it("por tributo ordena do maior para o menor", () => {
    expect(calcular(series, sel("federal"), 2026, "mes", 1).porTributo).toEqual([
      { tributo: "IR", valor: 100 }, { tributo: "IPI", valor: 10 },
    ]);
  });
  it("sem nada selecionado devolve valor nulo", () => {
    expect(calcular(series, sel("estadual", { ufs: new Set() }), 2026, "bimestre", 1).valor).toBeNull();
  });
});
