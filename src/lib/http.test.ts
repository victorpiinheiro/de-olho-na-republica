import { describe, expect, it } from "vitest";
import { falhaDeRede, HttpError } from "./http";

describe("falhaDeRede", () => {
  it("fetch que não conseguiu conectar (ex.: tempo de conexão esgotado) é falha de rede", () => {
    const e = new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    expect(falhaDeRede(e)).toBe(true);
  });

  it("tempo esgotado pelo AbortSignal é falha de rede", () => {
    expect(falhaDeRede(new DOMException("tempo esgotado", "TimeoutError"))).toBe(true);
    expect(falhaDeRede(new DOMException("abortado", "AbortError"))).toBe(true);
  });

  it("5xx e 429 são falha de rede; 4xx não", () => {
    for (const status of [429, 500, 502, 503, 504]) expect(falhaDeRede(new HttpError("https://x", status)), String(status)).toBe(true);
    for (const status of [400, 403, 404]) expect(falhaDeRede(new HttpError("https://x", status)), String(status)).toBe(false);
  });

  it("erro de conteúdo (ex.: formato da resposta mudou) NÃO é falha de rede e deve derrubar o job", () => {
    expect(falhaDeRede(new Error("série de população vazia"))).toBe(false);
    expect(falhaDeRede(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(falhaDeRede("texto qualquer")).toBe(false);
    expect(falhaDeRede(null)).toBe(false);
  });
});
