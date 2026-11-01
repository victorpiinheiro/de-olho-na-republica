// Limite de alerta: o Supabase grátis tem 500 MB de Postgres.
export const LIMITE_BYTES = 400 * 1024 * 1024;

export function formatarBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const acimaDoLimite = (bytes: number, limite = LIMITE_BYTES) => bytes > limite;
