import { z } from "zod";

// API do Wikimedia Commons (action=query, prop=imageinfo, formatversion=2). Só os campos que usamos:
// se um sumir, a validação quebra em vez de mostrar foto sem crédito.

const meta = z.object({ value: z.string() });

const imageinfoSchema = z.object({
  thumburl: z.string(), // miniatura de 480 px (ou o original, se for menor)
  descriptionurl: z.string(), // página do arquivo no Commons, com autor e licença
  extmetadata: z.object({
    LicenseShortName: meta.optional(),
    LicenseUrl: meta.optional(),
    Artist: meta.optional(),
    Restrictions: meta.optional(),
  }),
});

const paginaSchema = z.object({
  title: z.string(),
  missing: z.boolean().optional(),
  imageinfo: z.array(imageinfoSchema).optional(),
});

const mapeamento = z.array(z.object({ from: z.string(), to: z.string() }));

export const commonsSchema = z.object({
  query: z.object({
    pages: z.array(paginaSchema),
    normalized: mapeamento.optional(),
    redirects: mapeamento.optional(),
  }),
});
export type CommonsResposta = z.infer<typeof commonsSchema>;
type Imageinfo = z.infer<typeof imageinfoSchema>;

export interface FotoNossa {
  url: string; // miniatura, sem parâmetros de rastreio
  autor: string | null; // null = autor desconhecido
  licenca: string; // "Public domain", "CC BY 2.0"...
  licencaUrl: string | null;
  pagina: string; // página do arquivo no Commons
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

// O campo Artist vem em HTML ("<a href=...>Palácio do Planalto</a> from Brasilia") e com sujeira de upload
// ("Own work--Jebulon (talk) 09:40, 6 June 2014 (UTC)", "Unknown authorUnknown author").
export function limparAutor(html: string): string | null {
  // Tags de bloco viram quebra de linha; as demais somem sem deixar espaço ("(<a>talk</a>)" → "(talk)").
  let t = html.replace(/<\/?(?:br|p|div|ul|ol|li)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "");
  for (const [e, c] of Object.entries(ENTIDADES)) t = t.split(e).join(c);
  t = t.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  t = t
    .replace(/\s+/g, " ")
    .replace(/^own work\s*[-–—]*\s*/i, "")
    .replace(/\s*\d{1,2}:\d{2},.*$/, "") // carimbo de data do upload
    .replace(/\s*\(talk\)\s*/gi, " ")
    .trim();
  if (t.length === 0 || /^(unknown|desconhecid)/i.test(t)) return null;
  return t.length > 100 ? `${t.slice(0, 99).trimEnd()}…` : t;
}

// Foto só entra com licença conhecida e sem restrição declarada (ex.: direitos de personalidade).
export function toFoto(info: Imageinfo): FotoNossa | null {
  const licenca = info.extmetadata.LicenseShortName?.value.trim();
  if (!licenca || info.extmetadata.Restrictions?.value.trim()) return null;
  return {
    url: info.thumburl.split("?")[0],
    autor: info.extmetadata.Artist ? limparAutor(info.extmetadata.Artist.value) : null,
    licenca,
    licencaUrl: info.extmetadata.LicenseUrl?.value.trim() || null,
    pagina: info.descriptionurl,
  };
}

// "http://commons.wikimedia.org/wiki/Special:FilePath/Foto_Oficial.jpg" → "Foto Oficial.jpg"
export function arquivoDaFoto(uri: string): string {
  const m = /\/Special:FilePath\/(.+)$/.exec(uri);
  if (!m) throw new Error(`endereço de foto inesperado: ${uri}`);
  return decodeURIComponent(m[1]).replace(/_/g, " ");
}

// Acha a página do arquivo seguindo "normalized" e "redirects" da resposta.
export function fotosPorArquivo(respostas: CommonsResposta[], arquivos: string[]): Map<string, FotoNossa | null> {
  const paginas = new Map<string, Imageinfo | null>();
  const trocas = new Map<string, string>();
  for (const r of respostas) {
    for (const p of r.query.pages) paginas.set(p.title, p.missing ? null : (p.imageinfo?.[0] ?? null));
    for (const t of [...(r.query.normalized ?? []), ...(r.query.redirects ?? [])]) trocas.set(t.from, t.to);
  }
  const resolver = (titulo: string) => {
    let t = titulo;
    for (let i = 0; i < 5 && trocas.has(t); i++) t = trocas.get(t)!;
    return t;
  };
  return new Map(
    arquivos.map((a) => {
      const info = paginas.get(resolver(`File:${a}`));
      return [a, info ? toFoto(info) : null];
    }),
  );
}
