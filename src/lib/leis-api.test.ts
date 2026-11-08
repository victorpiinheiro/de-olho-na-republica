import { describe, expect, it } from "vitest";
import { BUSCA_MAX, lerParametrosLeis, MAX_PAGINAS, normalizarBusca, termosDaBusca } from "./leis-api";

const ler = (q: string) => lerParametrosLeis(new URLSearchParams(q));

describe("lerParametrosLeis", () => {
  it("aceita aba, página e ano", () => {
    expect(ler("aba=viraram-lei&pagina=2&ano=2025")).toEqual({ ok: true, valor: { aba: "viraram-lei", pagina: 2, ano: 2025, busca: null, autor: null } });
  });

  it("página e ano são opcionais", () => {
    expect(ler("aba=todas")).toEqual({ ok: true, valor: { aba: "todas", pagina: 0, ano: null, busca: null, autor: null } });
    expect(ler("aba=todas&ano=todos&pagina=0")).toMatchObject({ ok: true, valor: { ano: null } });
    expect(ler("aba=todas&ano=")).toMatchObject({ ok: true, valor: { ano: null } });
  });

  it("aceita todas as abas da tela", () => {
    for (const aba of ["todas", "nominais", "viraram-lei", "aprovadas-camara", "aprovadas-senado", "rejeitadas"]) {
      expect(ler(`aba=${aba}`).ok, aba).toBe(true);
    }
  });

  it.each([
    ["sem aba", ""],
    ["aba que não existe", "aba=outra"],
    ["aba com tentativa de injeção", "aba=todas';DROP TABLE x;--"],
    ["página negativa", "aba=todas&pagina=-1"],
    ["página com letras", "aba=todas&pagina=1a"],
    ["página decimal", "aba=todas&pagina=1.5"],
    [`página acima do máximo (${MAX_PAGINAS})`, `aba=todas&pagina=${MAX_PAGINAS + 1}`],
    ["página gigante", "aba=todas&pagina=99999999999"],
    ["ano com letras", "aba=todas&ano=20x5"],
    ["ano de 2 dígitos", "aba=todas&ano=25"],
    ["ano absurdo", "aba=todas&ano=1500"],
    ["ano com injeção", "aba=todas&ano=2025 OR 1=1"],
    ["busca de 1 caractere", "aba=todas&q=a"],
    [`busca acima de ${BUSCA_MAX} caracteres`, `aba=todas&q=${"x".repeat(BUSCA_MAX + 1)}`],
  ])("recusa: %s", (_nome, q) => {
    expect(ler(q).ok).toBe(false);
  });

  it("a última página permitida ainda passa", () => {
    expect(ler(`aba=todas&pagina=${MAX_PAGINAS}`).ok).toBe(true);
  });
});

describe("busca (q)", () => {
  it("limpa espaços repetidos e caracteres de controle", () => {
    expect(ler("aba=todas&q=%20%20PL%20%202418%2F2026%20")).toMatchObject({ ok: true, valor: { busca: "PL 2418/2026" } });
    expect(ler("aba=todas&q=reforma%00%0Atributaria")).toMatchObject({ ok: true, valor: { busca: "reforma tributaria" } });
  });
  it("sem q (ou q vazio) não há busca", () => {
    expect(ler("aba=todas")).toMatchObject({ valor: { busca: null } });
    expect(ler("aba=todas&q=")).toMatchObject({ valor: { busca: null } });
    expect(ler("aba=todas&q=%20%20")).toMatchObject({ valor: { busca: null } });
  });
  it("aceita aspas, apóstrofo e símbolos como texto comum (vão como parâmetro, nunca montam SQL)", () => {
    expect(ler("aba=todas&q=%27%3B%20DROP%20TABLE%20x%3B--")).toMatchObject({ ok: true, valor: { busca: "'; DROP TABLE x;--" } });
  });
  it("vale junto com aba, ano e página", () => {
    expect(ler("aba=viraram-lei&ano=2024&pagina=1&q=reforma")).toEqual({ ok: true, valor: { aba: "viraram-lei", pagina: 1, ano: 2024, busca: "reforma", autor: null } });
  });
});

describe("normalizarBusca e termosDaBusca", () => {
  it("ignora acento, maiúscula e ponto de milhar", () => {
    expect(normalizarBusca("Reforma TRIBUTÁRIA")).toBe("reforma tributaria");
    expect(normalizarBusca("Lei nº 14.597/2023")).toBe("lei nº 14597/2023");
    expect(normalizarBusca("Ação")).toBe("acao");
  });
  it("separa por palavras, sem repetir e com limite", () => {
    expect(termosDaBusca("PL 2418/2026")).toEqual(["pl", "2418/2026"]);
    expect(termosDaBusca("reforma  reforma tributária")).toEqual(["reforma", "tributaria"]);
    expect(termosDaBusca("a b c d e f g h")).toHaveLength(6);
    expect(termosDaBusca("   ")).toEqual([]);
  });
});

describe("autor", () => {
  it("é opcional: sem autor (ou vazio) vale qualquer um", () => {
    expect(ler("aba=todas")).toMatchObject({ ok: true, valor: { autor: null } });
    expect(ler("aba=todas&autor=")).toMatchObject({ ok: true, valor: { autor: null } });
  });
  it("aceita o id do parlamentar e vale junto com aba, ano, busca e página", () => {
    expect(ler("aba=viraram-lei&ano=2024&pagina=1&q=saude&autor=1234")).toEqual({
      ok: true,
      valor: { aba: "viraram-lei", pagina: 1, ano: 2024, busca: "saude", autor: 1234 },
    });
  });
  it("só aceita número inteiro positivo (nada de texto, sinal, decimal ou zero)", () => {
    for (const ruim of ["abc", "-1", "1.5", "0", "1e3", "12 3", "1234567890", "'; DROP TABLE x;--"]) {
      expect(ler(`aba=todas&autor=${encodeURIComponent(ruim)}`)).toEqual({ ok: false, motivo: "autor inválido" });
    }
  });
});
