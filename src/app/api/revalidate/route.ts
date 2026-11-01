import { revalidatePath } from "next/cache";
import { log } from "@/lib/log";
import { autorizado, tipoDoCaminho, validarPaths } from "@/lib/revalidar";

// Chamada pelos jobs ao terminar: POST { paths: string[] } com Authorization: Bearer <REVALIDATE_SECRET>.
export async function POST(req: Request) {
  if (!autorizado(req.headers.get("authorization"), process.env.REVALIDATE_SECRET)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = await req.json().catch(() => null);
  const r = validarPaths(corpo);
  if (!r.ok) return Response.json({ erro: r.motivo }, { status: 400 });

  for (const path of r.paths) {
    const tipo = tipoDoCaminho(path);
    if (tipo) revalidatePath(path, tipo);
    else revalidatePath(path);
  }
  log("info", "revalidação", { paths: r.paths });
  return Response.json({ revalidados: r.paths });
}
