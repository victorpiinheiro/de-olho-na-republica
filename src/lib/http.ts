import { z } from "zod";
import { log } from "./log";

export interface RetryOptions {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} em ${url}`);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 5xx e 429 são transitórios; 4xx não adianta repetir.
const transitorio = (status: number) => status === 429 || status >= 500;

// Falha de comunicação (servidor inalcançável, tempo esgotado, 5xx ou 429), e não de conteúdo: quem chama pode decidir
// seguir com o dado que já tem. Resposta com formato errado (Zod) NÃO é falha de rede e deve continuar derrubando o job.
export function falhaDeRede(e: unknown): boolean {
  if (e instanceof HttpError) return transitorio(e.status);
  if (e instanceof TypeError && e.message === "fetch failed") return true;
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { retries = 6, timeoutMs = 60_000, baseDelayMs = 2_000 }: RetryOptions = {},
): Promise<Response> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      throw new HttpError(url, res.status);
    } catch (e) {
      const repetivel = !(e instanceof HttpError) || transitorio(e.status);
      if (!repetivel || tentativa >= retries) throw e;
      const espera = baseDelayMs * 2 ** tentativa;
      log("warn", "requisição falhou, tentando de novo", {
        url,
        tentativa: tentativa + 1,
        esperaMs: espera,
        erro: e instanceof Error ? e.message : String(e),
      });
      await esperar(espera);
    }
  }
}

export async function fetchBytes(url: string, opts?: RetryOptions): Promise<Uint8Array> {
  const res = await fetchWithRetry(url, {}, { timeoutMs: 180_000, ...opts });
  return new Uint8Array(await res.arrayBuffer());
}

const paginaSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    dados: z.array(item),
    links: z.array(z.object({ rel: z.string(), href: z.string() })),
  });

// Segue o link `next` até acabar.
export async function fetchAllPages<T extends z.ZodType>(
  primeiraUrl: string,
  item: T,
): Promise<z.infer<T>[]> {
  const schema = paginaSchema(item);
  const todos: z.infer<T>[] = [];
  let url: string | undefined = primeiraUrl;
  while (url) {
    const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
    const pagina = schema.parse(await res.json());
    todos.push(...pagina.dados);
    url = pagina.links.find((l) => l.rel === "next")?.href;
  }
  return todos;
}

// Endpoints de detalhe devolvem { dados: {...} }.
export async function fetchOne<T extends z.ZodType>(url: string, item: T): Promise<z.infer<T>> {
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  const { dados } = z.object({ dados: item }).parse(await res.json()) as { dados: z.infer<T> };
  return dados;
}
