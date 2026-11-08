import { describe, expect, it } from "vitest";
import { cortar } from "./site";

describe("cortar", () => {
  it("não mexe em texto que cabe, só arruma os espaços", () => {
    expect(cortar("  Altera   a Constituição.  ", 50)).toBe("Altera a Constituição.");
  });
  it("corta sem partir palavra e põe reticências, respeitando o limite", () => {
    const r = cortar("Altera a redação dos artigos 14 e 228 da Constituição Federal", 30);
    expect(r).toBe("Altera a redação dos artigos…");
    expect(r.length).toBeLessThanOrEqual(30);
  });
  it("palavra única maior que o limite ainda é cortada", () => {
    expect(cortar("a".repeat(100), 20).length).toBeLessThanOrEqual(20);
  });
});
