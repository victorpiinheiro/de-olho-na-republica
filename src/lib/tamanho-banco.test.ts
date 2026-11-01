import { describe, expect, it } from "vitest";
import { acimaDoLimite, formatarBytes, LIMITE_BYTES } from "./tamanho-banco";

describe("tamanho do banco", () => {
  it("formata em kB, MB e GB", () => {
    expect(formatarBytes(512 * 1024)).toBe("512 kB");
    expect(formatarBytes(120 * 1024 * 1024)).toBe("120.0 MB");
    expect(formatarBytes(2 * 1024 ** 3)).toBe("2.00 GB");
  });
  it("o limite é 400 MB e só passa dele estritamente acima", () => {
    expect(LIMITE_BYTES).toBe(419430400);
    expect(acimaDoLimite(LIMITE_BYTES)).toBe(false);
    expect(acimaDoLimite(LIMITE_BYTES + 1)).toBe(true);
  });
});
