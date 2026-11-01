import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autorizado, CAMINHOS_PERMITIDOS, tipoDoCaminho, validarPaths } from "./revalidar";

describe("autorizado", () => {
  it("aceita o segredo certo", () => expect(autorizado("Bearer abc123", "abc123")).toBe(true));
  it("recusa segredo errado, de outro tamanho ou ausente", () => {
    expect(autorizado("Bearer abc124", "abc123")).toBe(false);
    expect(autorizado("Bearer abc1234", "abc123")).toBe(false);
    expect(autorizado(null, "abc123")).toBe(false);
    expect(autorizado("abc123", "abc123")).toBe(false);
  });
  it("sem segredo configurado nunca autoriza (nem com cabeçalho vazio)", () => {
    expect(autorizado("Bearer ", undefined)).toBe(false);
    expect(autorizado("Bearer ", "")).toBe(false);
  });
});

describe("validarPaths", () => {
  it("aceita caminhos da lista e remove repetidos", () => {
    expect(validarPaths({ paths: ["/leis", "/orcamento", "/leis"] })).toEqual({ ok: true, paths: ["/leis", "/orcamento"] });
  });
  it("recusa caminho fora da lista", () => {
    expect(validarPaths({ paths: ["/leis", "/api/revalidate"] })).toMatchObject({ ok: false });
    expect(validarPaths({ paths: ["/leis/proposicao/45"] })).toMatchObject({ ok: false });
  });
  it("recusa corpo malformado", () => {
    for (const c of [null, {}, { paths: [] }, { paths: "/leis" }, { paths: [1] }]) {
      expect(validarPaths(c)).toMatchObject({ ok: false });
    }
  });
});

describe("tipoDoCaminho", () => {
  it("padrão com colchetes pede type page", () => {
    expect(tipoDoCaminho("/leis/proposicao/[id]")).toBe("page");
    expect(tipoDoCaminho("/leis")).toBeUndefined();
  });
  it("todo caminho permitido tem uma página correspondente em src/app", () => {
    for (const c of CAMINHOS_PERMITIDOS) {
      const pagina = join(process.cwd(), "src/app/(site)", c === "/" ? "" : c, "page.tsx");
      expect(existsSync(pagina), c).toBe(true);
    }
  });
});
