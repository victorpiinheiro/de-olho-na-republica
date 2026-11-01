import { db } from "@/lib/db";
import { normalizarNome, toParlamentarSenador } from "@/lib/sources/senado/adapter";
import { listarSenadoresDaLegislatura, listarSenadoresEmExercicio } from "@/lib/sources/senado/client";
import type { SenadorApi } from "@/lib/sources/senado/schemas";

export const LEGISLATURA_SENADO = 57;

const codigo = (s: SenadorApi) => s.IdentificacaoParlamentar.CodigoParlamentar;

// A lista atual tem partido e UF; a da legislatura cobre suplentes e quem já saiu.
// Onde as duas existem, a atual prevalece.
export async function carregarSenadores() {
  const [atuais, legislatura] = await Promise.all([
    listarSenadoresEmExercicio(),
    listarSenadoresDaLegislatura(LEGISLATURA_SENADO),
  ]);
  const porCodigo = new Map<number, SenadorApi>();
  for (const s of legislatura) porCodigo.set(codigo(s), s);
  for (const s of atuais) porCodigo.set(codigo(s), s);
  return { porCodigo, ativos: new Set(atuais.map(codigo)), atuais };
}

// Garante um Parlamentar para cada código citado em despesas ou votos. Só cria quem é
// referenciado: importar os 245 da legislatura traria suplentes que nunca exerceram o mandato.
export async function garantirSenadores(
  codigos: Iterable<number>,
  fonte: Awaited<ReturnType<typeof carregarSenadores>>,
) {
  const existentes = await db.parlamentar.findMany({
    where: { casa: "SENADO" },
    select: { id: true, idOrigem: true },
  });
  const idPorOrigem = new Map(existentes.map((p) => [p.idOrigem, p.id]));

  const faltando = [...new Set(codigos)].filter((c) => !idPorOrigem.has(String(c)));
  const novos = faltando.map((c) => {
    const s = fonte.porCodigo.get(c);
    if (!s) throw new Error(`senador ${c} não está na legislatura ${LEGISLATURA_SENADO}`);
    return toParlamentarSenador(s, fonte.ativos.has(c), LEGISLATURA_SENADO);
  });

  if (novos.length > 0) {
    await db.parlamentar.createMany({ data: novos, skipDuplicates: true });
    const criados = await db.parlamentar.findMany({
      where: { casa: "SENADO", idOrigem: { in: novos.map((n) => n.idOrigem) } },
      select: { id: true, idOrigem: true },
    });
    for (const p of criados) idPorOrigem.set(p.idOrigem, p.id);
  }
  return { idPorOrigem, criados: novos.length };
}

// Nome normalizado → id, só para nomes sem ambiguidade (ligar autoria a senador).
export async function mapaNomesSenadores() {
  const ps = await db.parlamentar.findMany({
    where: { casa: "SENADO" },
    select: { id: true, nome: true },
  });
  const contagem = new Map<string, number>();
  for (const p of ps) contagem.set(normalizarNome(p.nome), (contagem.get(normalizarNome(p.nome)) ?? 0) + 1);
  return new Map(ps.filter((p) => contagem.get(normalizarNome(p.nome)) === 1).map((p) => [normalizarNome(p.nome), p.id]));
}
