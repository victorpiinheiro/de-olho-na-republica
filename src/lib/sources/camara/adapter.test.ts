import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { hashDespesa, toDespesa, toParlamentar, unirDeputados } from "./adapter";
import { COLUNAS_DESPESA_CSV, deputadoSchema, despesaCsvSchema } from "./schemas";

const linhaBase = {
  ideCadastro: "204379",
  txtDescricao: "MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR",
  txtFornecedor: "AMORETTO CAFES EXPRESSO LTDA",
  txtCNPJCPF: "085.324.290/0013-1",
  txtNumero: "2849",
  numSubCota: "1",
  numParcela: "0",
  datEmissao: "2026-01-08T00:00:00",
  vlrLiquido: "1467",
  numMes: "1",
  numAno: "2026",
  ideDocumento: "8044688",
  urlDocumento: "https://www.camara.leg.br/cota-parlamentar/documentos/publ/2812/2026/8044688.pdf",
};

describe("toParlamentar", () => {
  it("converte o deputado da API", () => {
    const d = deputadoSchema.parse({
      id: 204379,
      uri: "x",
      nome: "Acácio Favacho",
      siglaPartido: "MDB",
      uriPartido: "x",
      siglaUf: "AP",
      idLegislatura: 57,
      urlFoto: "https://foto",
      email: null,
    });
    expect(toParlamentar(d)).toEqual({
      casa: "CAMARA",
      idOrigem: "204379",
      nome: "Acácio Favacho",
      partido: "MDB",
      uf: "AP",
      fotoUrl: "https://foto",
      email: null,
      legislatura: 57,
    });
  });

  it("quebra se um campo obrigatório sumir da API", () => {
    expect(() => deputadoSchema.parse({ id: 1, nome: "A" })).toThrow();
  });
});

describe("unirDeputados", () => {
  const dep = (id: number, partido: string) =>
    deputadoSchema.parse({
      id,
      nome: `Dep ${id}`,
      siglaPartido: partido,
      siglaUf: "SP",
      idLegislatura: 57,
      urlFoto: null,
      email: null,
    });

  it("junta repetidos num só, ativa só quem está em exercício e prefere os dados atuais", () => {
    const legislatura = [dep(1, "A"), dep(1, "B"), dep(2, "C"), dep(3, "D")];
    const emExercicio = [dep(1, "B"), dep(3, "E")];
    const r = unirDeputados(legislatura, emExercicio);

    expect(r).toHaveLength(3);
    const por = Object.fromEntries(r.map((p) => [p.idOrigem, p]));
    expect(por["1"]).toMatchObject({ partido: "B", ativo: true });
    expect(por["2"]).toMatchObject({ partido: "C", ativo: false });
    expect(por["3"]).toMatchObject({ partido: "E", ativo: true });
  });
});

describe("toDespesa", () => {
  it("converte valor, data e url", () => {
    const d = toDespesa(despesaCsvSchema.parse(linhaBase));
    expect(d).toMatchObject({
      idOrigemDeputado: "204379",
      ano: 2026,
      mes: 1,
      valor: "1467",
      cnpjCpf: "085.324.290/0013-1",
    });
    expect(d.dataDocumento?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("mantém estorno (valor negativo) e aceita decimal", () => {
    expect(toDespesa(despesaCsvSchema.parse({ ...linhaBase, vlrLiquido: "-245.24" })).valor).toBe(
      "-245.24",
    );
  });

  it("campos vazios viram null", () => {
    const d = toDespesa(
      despesaCsvSchema.parse({ ...linhaBase, urlDocumento: "", txtCNPJCPF: "", datEmissao: "" }),
    );
    expect(d.urlDocumento).toBeNull();
    expect(d.cnpjCpf).toBeNull();
    expect(d.dataDocumento).toBeNull();
  });

  it("rejeita valor e mês inválidos", () => {
    expect(() => despesaCsvSchema.parse({ ...linhaBase, vlrLiquido: "1,5" })).toThrow();
    expect(() => despesaCsvSchema.parse({ ...linhaBase, numMes: "13" })).toThrow();
  });
});

describe("hashDespesa", () => {
  const r = despesaCsvSchema.parse(linhaBase);

  it("é estável para a mesma linha", () => {
    expect(hashDespesa(r)).toBe(hashDespesa(despesaCsvSchema.parse({ ...linhaBase })));
  });

  it("muda se valor ou documento mudam", () => {
    expect(hashDespesa(r)).not.toBe(hashDespesa({ ...r, vlrLiquido: "1468" }));
    expect(hashDespesa(r)).not.toBe(hashDespesa({ ...r, ideDocumento: "999" }));
  });
});

describe("lerDespesasCsv", () => {
  const cabecalho = (cols: readonly string[]) => cols.map((c) => `"${c}"`).join(";");
  const valores = (l: Record<string, string>) =>
    COLUNAS_DESPESA_CSV.map((c) => `"${l[c]}"`).join(";");

  async function ler(csv: string) {
    const zip = zipSync({ "Ano-2026.csv": strToU8("﻿" + csv) });
    vi.resetModules();
    vi.doMock("../../http", () => ({ fetchBytes: async () => zip, fetchAllPages: vi.fn() }));
    const { lerDespesasCsv } = await import("./client");
    const invalidas: { linha: number; erro: string }[] = [];
    const linhas = [];
    for await (const l of lerDespesasCsv("http://x/Ano-2026.csv.zip", invalidas)) linhas.push(l);
    return { linhas, invalidas };
  }

  it("lê o zip, valida e separa linhas inválidas", async () => {
    const csv = [
      cabecalho(COLUNAS_DESPESA_CSV),
      valores(linhaBase),
      valores({ ...linhaBase, vlrLiquido: "abc" }),
    ].join("\n");
    const { linhas, invalidas } = await ler(csv);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].numAno).toBe(2026);
    expect(invalidas).toHaveLength(1);
    expect(invalidas[0].linha).toBe(3);
  });

  it("quebra se uma coluna for renomeada na fonte", async () => {
    const renomeado = COLUNAS_DESPESA_CSV.map((c) => (c === "vlrLiquido" ? "valorLiquido" : c));
    await expect(ler([cabecalho(renomeado), valores(linhaBase)].join("\n"))).rejects.toThrow(
      /vlrLiquido/,
    );
  });
});
