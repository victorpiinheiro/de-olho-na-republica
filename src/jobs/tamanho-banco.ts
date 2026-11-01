import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { acimaDoLimite, formatarBytes, LIMITE_BYTES } from "@/lib/tamanho-banco";

// Registra o tamanho do banco e FALHA acima de 400 MB: a falha dispara o alerta do workflow
// (o plano grátis do Supabase tem 500 MB). Como o job também faz uma consulta, ajuda a manter o banco ativo.
runJob("tamanho-banco", async () => {
  const [linha] = await db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`;
  const bytes = Number(linha?.bytes ?? 0);
  const resumo = { tamanho: formatarBytes(bytes), bytes, limite: formatarBytes(LIMITE_BYTES) };
  if (acimaDoLimite(bytes)) throw new Error(`banco com ${resumo.tamanho}, acima do limite de ${resumo.limite}`);
  return resumo;
});
