import { describe, expect, it } from "vitest";
import { diasAtras, intervalosMensais } from "./datas";

describe("intervalosMensais", () => {
  it("dentro de um mês devolve uma janela só", () => {
    expect(intervalosMensais("2026-10-05", "2026-10-20")).toEqual([["2026-10-05", "2026-10-20"]]);
  });
  it("quebra por mês civil, inclusive em ano bissexto e virada de ano", () => {
    expect(intervalosMensais("2023-12-15", "2024-03-10")).toEqual([
      ["2023-12-15", "2023-12-31"],
      ["2024-01-01", "2024-01-31"],
      ["2024-02-01", "2024-02-29"],
      ["2024-03-01", "2024-03-10"],
    ]);
  });
  it("intervalo invertido não gera janelas", () => {
    expect(intervalosMensais("2026-10-20", "2026-10-05")).toEqual([]);
  });
});

describe("diasAtras", () => {
  it("subtrai dias atravessando o mês", () => {
    expect(diasAtras(7, new Date("2026-03-03T12:00:00Z"))).toBe("2026-02-24");
  });
});
