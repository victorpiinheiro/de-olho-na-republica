type Nivel = "info" | "warn" | "error";

export function log(nivel: Nivel, msg: string, campos: Record<string, unknown> = {}) {
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, msg, ...campos });
  (nivel === "error" ? console.error : console.log)(linha);
}
