import { listarAutoresDeLeis } from "@/lib/queries/leis";

// Lista para o filtro "Autor" da tela de Leis: GET /api/leis/autores. Muda pouco (só quando entra proposição nova
// com votação), então a Vercel guarda por 1 dia.
export async function GET() {
  const autores = await listarAutoresDeLeis();
  return Response.json({ autores }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
