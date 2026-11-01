import { db } from "./db";
import { log } from "./log";

export async function runJob(nome: string, fn: () => Promise<Record<string, unknown> | void>) {
  const inicio = Date.now();
  log("info", "job iniciado", { job: nome });
  try {
    const resumo = await fn();
    log("info", "job concluído", { job: nome, duracaoMs: Date.now() - inicio, ...resumo });
  } catch (e) {
    log("error", "job falhou", {
      job: nome,
      duracaoMs: Date.now() - inicio,
      erro: e instanceof Error ? e.message : String(e),
      causa: e instanceof Error ? e.cause : undefined,
      stack: e instanceof Error ? e.stack : undefined,
    });
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
