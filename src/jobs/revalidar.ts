import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { validarPaths } from "@/lib/revalidar";

// Uso: tsx revalidar.ts /leis /parlamentares ...
// Chama POST {SITE_URL}/api/revalidate ao fim de um job, para as páginas mostrarem os dados novos.
// Sem SITE_URL (site ainda não publicado) só avisa. Com SITE_URL, qualquer falha derruba o job.
runJob("revalidar", async () => {
  const paths = process.argv.slice(2);
  const v = validarPaths({ paths });
  if (!v.ok) throw new Error(v.motivo);

  const site = process.env.SITE_URL?.replace(/\/+$/, "");
  if (!site) {
    log("warn", "SITE_URL não definida: revalidação ignorada", { paths });
    return { ignorado: true };
  }
  const segredo = process.env.REVALIDATE_SECRET;
  if (!segredo) throw new Error("REVALIDATE_SECRET não definido");

  const r = await fetch(`${site}/api/revalidate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${segredo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paths: v.paths }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`/api/revalidate respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { revalidados: v.paths.length };
});
