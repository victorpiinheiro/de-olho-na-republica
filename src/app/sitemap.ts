import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { ABAS } from "@/lib/leis";
import { SITE_URL } from "@/lib/site";

// Lista as páginas para o Google: as fixas, uma por aba de Leis e uma por parlamentar e por proposição (todas as que
// existem no banco aparecem em alguma aba). Refeito 1x por dia, na mesma cadência das páginas de parlamentares.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [parlamentares, proposicoes] = await Promise.all([
    db.parlamentar.findMany({ select: { id: true, atualizadoEm: true }, orderBy: { id: "asc" } }),
    db.proposicao.findMany({ select: { id: true, atualizadoEm: true }, orderBy: { id: "asc" } }),
  ]);

  // "/" só redireciona para o Impostômetro: o endereço de verdade é o do Impostômetro.
  const fixas = ["/impostometro", "/parlamentares", "/parlamentares/senado", "/eleicoes", "/historia", "/orcamento"];
  const leis = ABAS.map((a) => a.href); // "/leis" e uma por aba

  return [
    ...[...fixas, ...leis].map((caminho) => ({ url: `${SITE_URL}${caminho}` })),
    ...parlamentares.map((p) => ({ url: `${SITE_URL}/parlamentares/${p.id}`, lastModified: p.atualizadoEm })),
    ...proposicoes.map((p) => ({ url: `${SITE_URL}/leis/proposicao/${p.id}`, lastModified: p.atualizadoEm })),
  ];
}
