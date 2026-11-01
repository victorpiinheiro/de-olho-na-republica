import { describe, expect, it } from "vitest";
import {
  acumuladoEm,
  arrecadadoHoje,
  inicioDoDia,
  montarSerie,
  inicioDoMes,
  mesCorrente,
  projetarMeses,
  taxaPorSegundo,
  totaisPorMes,
  variacaoReal,
  type LinhaArrecadacao,
  type MesTotal,
} from "./impostometro";

const linha = (tributo: string, ano: number, mes: number, valor: number, extra: Partial<LinhaArrecadacao> = {}): LinhaArrecadacao => ({
  tributo, ano, mes, valor, estimado: false, valorReal: null, ...extra,
});

// 2025 inteiro: A = 100 por mês, B = 10 por mês. 2026 oficial só jan-fev: A +10%, B +50%.
const base: LinhaArrecadacao[] = [];
for (let m = 1; m <= 12; m++) base.push(linha("A", 2025, m, 100), linha("B", 2025, m, 10));
for (const m of [1, 2]) base.push(linha("A", 2026, m, 110), linha("B", 2026, m, 15));

describe("projetarMeses", () => {
  const proj = projetarMeses(2026, base);

  it("projeta os 10 meses restantes de cada tributo, marcados como estimados", () => {
    expect(proj).toHaveLength(2 * 10);
    expect(proj.every((l) => l.estimado && l.valorReal === null && l.ano === 2026)).toBe(true);
    expect(proj.map((l) => l.mes).filter((m) => m <= 2)).toEqual([]);
  });

  it("usa o mesmo mês do ano anterior × crescimento de cada tributo", () => {
    const a3 = proj.find((l) => l.tributo === "A" && l.mes === 3);
    const b3 = proj.find((l) => l.tributo === "B" && l.mes === 3);
    expect(a3?.valor).toBe(110); // 100 × 1,10
    expect(b3?.valor).toBe(15); // 10 × 1,50
  });

  it("falha sem nenhum mês oficial no ano", () => {
    expect(() => projetarMeses(2026, base.filter((l) => l.ano === 2025))).toThrow(/nenhum mês oficial/);
  });

  it("falha se faltar um mês do ano anterior", () => {
    expect(() => projetarMeses(2026, base.filter((l) => !(l.ano === 2025 && l.mes === 5)))).toThrow(/sem 5\/2025/);
  });
});

describe("totaisPorMes", () => {
  it("soma os tributos e marca o mês estimado", () => {
    const t = totaisPorMes([...base, ...projetarMeses(2026, base)], 2026);
    expect(t).toHaveLength(12);
    expect(t[0]).toEqual({ mes: 1, valor: 125, estimado: false });
    expect(t[2]).toEqual({ mes: 3, valor: 125, estimado: true });
  });
});

describe("contador", () => {
  // Fevereiro de 2026 tem 28 dias. Jan = 3100, fev = 2800 (100 por dia), mar = 3100.
  const meses: MesTotal[] = [
    { mes: 1, valor: 3100, estimado: false },
    { mes: 2, valor: 2800, estimado: false },
    { mes: 3, valor: 3100, estimado: true },
  ];

  it("o mês começa à meia-noite de Brasília (03h UTC)", () => {
    expect(new Date(inicioDoMes(2026, 2)).toISOString()).toBe("2026-02-01T03:00:00.000Z");
  });

  it("acumula meses encerrados + fração linear do corrente", () => {
    const meioDeFev = inicioDoMes(2026, 2) + 14 * 86_400_000; // 14 de 28 dias
    expect(acumuladoEm(meioDeFev, 2026, meses)).toBeCloseTo(3100 + 1400, 6);
  });

  it("antes do ano começar vale 0 e depois do último mês vale a soma", () => {
    expect(acumuladoEm(inicioDoMes(2026, 1) - 1, 2026, meses)).toBe(0);
    expect(acumuladoEm(inicioDoMes(2027, 1), 2026, meses)).toBe(9000);
  });

  it("taxa por segundo = valor do mês / segundos do mês", () => {
    const agora = inicioDoMes(2026, 2) + 1000;
    expect(taxaPorSegundo(agora, 2026, meses)).toBeCloseTo(2800 / (28 * 86_400), 9);
    expect(mesCorrente(agora, 2026, meses)?.mes).toBe(2);
  });

  it("hoje = o que correu desde 00h de Brasília", () => {
    const seisHoras = inicioDoMes(2026, 2) + 5 * 86_400_000 + 6 * 3_600_000;
    expect(new Date(inicioDoDia(seisHoras)).toISOString()).toBe("2026-02-06T03:00:00.000Z");
    expect(arrecadadoHoje(seisHoras, 2026, meses)).toBeCloseTo(100 * (6 / 24), 6);
  });

  it("às 22h de Brasília ainda é o mesmo dia (já é o dia seguinte em UTC)", () => {
    const vinteDuasBr = inicioDoMes(2026, 2) + 22 * 3_600_000; // 01h UTC de 2 de fev
    expect(arrecadadoHoje(vinteDuasBr, 2026, meses)).toBeCloseTo(100 * (22 / 24), 6);
  });

  it("no primeiro dia do ano 'hoje' não puxa dezembro", () => {
    const doze = inicioDoMes(2026, 1) + 12 * 3_600_000;
    expect(arrecadadoHoje(doze, 2026, meses)).toBeCloseTo(100 * 0.5, 6);
  });
});

describe("variacaoReal", () => {
  const com = (ano: number, mes: number, real: number, extra: Partial<LinhaArrecadacao> = {}) =>
    linha("A", ano, mes, 0, { valorReal: real, ...extra });

  it("compara só os meses oficiais dos dois anos, a preços constantes", () => {
    const r = variacaoReal(
      [com(2025, 1, 100), com(2025, 2, 100), com(2025, 3, 999), com(2026, 1, 105), com(2026, 2, 107)],
      2026,
    );
    expect(r?.ateMes).toBe(2);
    expect(r?.variacao).toBeCloseTo(6, 9); // 212 / 200
  });

  it("ignora meses estimados e devolve null sem base", () => {
    expect(variacaoReal([com(2026, 1, 50, { estimado: true })], 2026)).toBeNull();
    expect(variacaoReal([com(2026, 1, 50)], 2026)).toBeNull();
  });
});

describe("montarSerie", () => {
  const l = (tributo: string, mes: number, valor: number, estimado = false) => ({ tributo, ano: 2026, mes, valor, estimado, valorReal: null });
  const doze = (tributo: string, valor: number, oficiaisAte: number) =>
    Array.from({ length: 12 }, (_, i) => l(tributo, i + 1, valor, i + 1 > oficiaisAte));

  it("soma UFs, marca o mês estimado e acumula por tributo só até o último oficial", () => {
    const sp = doze("Impostos estaduais", 100, 8);
    const mg = doze("Impostos estaduais", 10, 8);
    const s = montarSerie([...sp, ...mg], 2026)!;
    expect(s.ultimoMesOficial).toBe(8);
    expect(s.meses[0].valor).toBe(110);
    expect(s.meses[8].estimado).toBe(true);
    expect(s.porTributo).toEqual([{ tributo: "Impostos estaduais", valor: 880 }]);
  });

  it("tirar uma UF muda o total (ver sem SP)", () => {
    const sp = doze("Impostos estaduais", 100, 8);
    const mg = doze("Impostos estaduais", 10, 8);
    expect(montarSerie([...sp, ...mg], 2026)!.meses[0].valor).toBe(110);
    expect(montarSerie(mg, 2026)!.meses[0].valor).toBe(10);
  });

  it("respeita o limite de mês ao somar fontes com defasagens diferentes", () => {
    const s = montarSerie([...doze("A", 1, 9), ...doze("B", 1, 8)], 2026, 8)!;
    expect(s.ultimoMesOficial).toBe(8);
    expect(s.porTributo.map((t) => t.valor)).toEqual([8, 8]);
  });

  it("devolve null sem mês oficial ou com série incompleta", () => {
    expect(montarSerie(doze("A", 1, 0), 2026)).toBeNull();
    expect(montarSerie(doze("A", 1, 8).slice(0, 11), 2026)).toBeNull();
  });
});
