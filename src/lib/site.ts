// Endereço público do site (o www é o principal; o endereço sem www redireciona para ele). Usado nos metadados, no
// robots.txt e no sitemap. Em outro domínio (ex.: teste), defina SITE_URL.
export const SITE_URL = (process.env.SITE_URL ?? "https://www.deolhonarepublica.com.br").replace(/\/+$/, "");

// Corta no limite sem partir palavra, para descrições e títulos.
export function cortar(texto: string, max: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), max / 2)).trimEnd()}…`;
}
