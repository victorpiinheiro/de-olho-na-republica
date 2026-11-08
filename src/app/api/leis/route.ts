import { lerParametrosLeis } from "@/lib/leis-api";
import { listarLeis, POR_ABA } from "@/lib/queries/leis";

// "Carregar mais" e filtro por ano da tela de Leis: GET /api/leis?aba=viraram-lei&pagina=1&ano=2025.
// A primeira página de cada aba já vem pronta na própria página (estática); aqui vem o resto, direto do banco.
// A Vercel guarda a resposta por 1 hora (a mesma frequência da página) e serve a antiga enquanto renova.
export async function GET(req: Request) {
  const r = lerParametrosLeis(new URL(req.url).searchParams);
  if (!r.ok) return Response.json({ erro: r.motivo }, { status: 400 });
  const { aba, pagina, ano, busca, autor } = r.valor;

  const { cards, total } = await listarLeis(aba, { offset: pagina * POR_ABA, ano, busca, autor });
  // Buscas e filtros por autor variam muito: guarda por menos tempo. Sem busca é a mesma lista da página (1 hora).
  const cache = busca || autor ? "public, s-maxage=600, stale-while-revalidate=3600" : "public, s-maxage=3600, stale-while-revalidate=86400";
  return Response.json({ cards, total }, { headers: { "Cache-Control": cache } });
}
