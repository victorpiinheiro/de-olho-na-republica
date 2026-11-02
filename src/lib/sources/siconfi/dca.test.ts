import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contaPai, liquido, toReceitaEstadual } from "./dca";
import { dcaSchema, type LinhaDca } from "./schemas";

// Fixtures: respostas reais de GET /dca (DCA-Anexo I-C, exercício 2025) de SP e MG, só as contas 1.1.x.
const ler = (nome: string) => dcaSchema.parse(JSON.parse(readFileSync(join(__dirname, "fixtures", nome), "utf8")));
const sp = ler("dca-sp-2025.json").items;
const mg = ler("dca-mg-2025.json").items;
const achar = (r: ReturnType<typeof toReceitaEstadual>, cod: string) => r.find((c) => c.codConta === cod)!;

describe("contaPai", () => {
  it("zera o último segmento não nulo", () => {
    expect(contaPai("RO1.1.1.4.50.1.0")).toBe("RO1.1.1.4.50.0.0");
    expect(contaPai("RO1.1.1.4.50.0.0")).toBe("RO1.1.1.4.00.0.0");
    expect(contaPai("RO1.1.1.4.00.0.0")).toBe("RO1.1.1.0.00.0.0");
    expect(contaPai("RO1.1.1.0.00.0.0")).toBe("RO1.1.0.0.00.0.0");
    expect(contaPai("RO1.1.0.0.00.0.0")).toBeNull();
  });
});

describe("toReceitaEstadual", () => {
  const rSp = toReceitaEstadual(sp, 2025, "SP");
  const rMg = toReceitaEstadual(mg, 2025, "MG");

  it("separa o bruto das deduções e dá o nome sem o código na frente", () => {
    const impostos = achar(rSp, "RO1.1.1.0.00.0.0");
    expect(impostos.conta).toBe("Impostos");
    expect(Math.round(impostos.bruto / 1e8)).toBe(2946); // R$ 294,6 bi
    expect(Math.round(impostos.deducaoFundeb / 1e8)).toBe(404); // R$ 40,4 bi
  });

  it("abre ICMS, IPVA e ITCMD", () => {
    const icms = achar(rSp, "RO1.1.1.4.50.1.0");
    expect(icms.conta).toMatch(/^Imposto sobre Operações Relativas à Circulação/);
    expect(icms.bruto).toBeGreaterThan(2e11);
    expect(achar(rSp, "RO1.1.1.2.51.0.0").conta).toMatch(/Veículos Automotores/);
    expect(achar(rSp, "RO1.1.1.2.52.0.0").conta).toMatch(/Causa Mortis/);
  });

  it("define o nível pela profundidade da conta", () => {
    expect(achar(rSp, "RO1.1.0.0.00.0.0").nivel).toBe(0);
    expect(achar(rSp, "RO1.1.1.0.00.0.0").nivel).toBe(1);
    expect(achar(rSp, "RO1.1.1.4.50.1.0").nivel).toBe(4);
  });

  it("só guarda a árvore de tributos (1.1.x)", () => {
    expect(rSp.every((c) => /^RO1\.1\./.test(c.codConta))).toBe(true);
  });

  it("bruto menos as três deduções dá o valor líquido que o RREO mostra (Minas: R$ 73,43 bi)", () => {
    const total = liquido(achar(rMg, "RO1.1.1.0.00.0.0")) + liquido(achar(rMg, "RO1.1.2.0.00.0.0"));
    expect(Math.abs(total - 73.43e9)).toBeLessThan(0.02e9);
  });

  it("falha se as partes não somarem o pai", () => {
    const adulterada: LinhaDca[] = sp.map((l) =>
      l.cod_conta === "RO1.1.1.2.51.0.0" && l.coluna === "Receitas Brutas Realizadas" ? { ...l, valor: (l.valor ?? 0) + 1e6 } : l,
    );
    expect(() => toReceitaEstadual(adulterada, 2025, "SP")).toThrow(/partes somam/);
  });

  it("falha se a estrutura mudar (sem as contas de impostos e taxas)", () => {
    const semTaxas = sp.filter((l) => !l.cod_conta.startsWith("RO1.1.2."));
    expect(() => toReceitaEstadual(semTaxas, 2025, "SP")).toThrow(/estrutura mudou/);
  });

  it("falha se a resposta for de outro estado ou ano", () => {
    expect(() => toReceitaEstadual(sp, 2025, "MG")).toThrow(/em resposta de MG/);
    expect(() => toReceitaEstadual(sp, 2024, "SP")).toThrow(/em resposta de SP\/2024/);
  });

  it("falha se uma conta se repetir na mesma coluna", () => {
    expect(() => toReceitaEstadual([...sp, sp[0]], 2025, "SP")).toThrow(/repetida/);
  });
});
