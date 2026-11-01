import { timingSafeEqual } from "node:crypto";

// Só estas rotas podem ser revalidadas por fora. Quem tiver o segredo não consegue
// invalidar caminhos arbitrários. Rotas com [param] revalidam todas as páginas daquele padrão.
export const CAMINHOS_PERMITIDOS = [
  "/",
  "/impostometro",
  "/parlamentares",
  "/parlamentares/senado",
  "/parlamentares/[id]",
  "/leis",
  "/leis/[aba]",
  "/leis/proposicao/[id]",
  "/eleicoes",
  "/historia",
  "/orcamento",
] as const;

export type ResultadoPaths =
  | { ok: true; paths: string[] }
  | { ok: false; motivo: string };

export function validarPaths(corpo: unknown): ResultadoPaths {
  const paths = (corpo as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((p) => typeof p !== "string")) {
    return { ok: false, motivo: "informe { paths: string[] } com ao menos um caminho" };
  }
  const permitidos = new Set<string>(CAMINHOS_PERMITIDOS);
  const invalidos = (paths as string[]).filter((p) => !permitidos.has(p));
  if (invalidos.length > 0) return { ok: false, motivo: `caminho não permitido: ${invalidos.join(", ")}` };
  return { ok: true, paths: [...new Set(paths as string[])] };
}

// "Bearer <segredo>" comparado em tempo constante. Sem segredo configurado, nunca autoriza.
export function autorizado(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || !cabecalho?.startsWith("Bearer ")) return false;
  const enviado = Buffer.from(cabecalho.slice(7));
  const esperado = Buffer.from(segredo);
  return enviado.length === esperado.length && timingSafeEqual(enviado, esperado);
}

// Rota com colchetes é um padrão: o Next exige type "page" para revalidar todas as páginas dele.
export const tipoDoCaminho = (path: string): "page" | undefined => (path.includes("[") ? "page" : undefined);
