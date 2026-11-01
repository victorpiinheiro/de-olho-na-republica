import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CasaLegislativa } from "@/lib/leis";
import { SEM_VOTO } from "@/lib/queries/leis";
import type { LinhaRanking } from "@/lib/ranking";

interface LinhaSql {
  id: number;
  nome: string;
  partido: string;
  uf: string;
  fotoUrl: string | null;
  ativo: boolean;
  gasto: unknown;
  notas: bigint;
  maiorCategoria: string | null;
  votou: bigint;
  nominais: bigint;
}

// Quem não gastou nada no ano também entra no ranking, com gasto 0.
// `nominais` é o total de votações nominais do plenário no ano (denominador da presença).
// Uma consulta só: o banco está longe (cada ida e volta custa ~1 s) e a conexão do pooler é única,
// então cinco consultas em paralelo viravam cinco esperas em fila.
export async function listarRanking(ano: number, casa: CasaLegislativa) {
  const de = new Date(Date.UTC(ano, 0, 1));
  const ate = new Date(Date.UTC(ano + 1, 0, 1));
  const rows = await db.$queryRaw<LinhaSql[]>(Prisma.sql`
    WITH gasto AS (
      SELECT d."parlamentarId", SUM(d.valor) AS total, COUNT(*) AS notas
      FROM "Despesa" d JOIN "Parlamentar" p ON p.id = d."parlamentarId"
      WHERE d.ano = ${ano} AND p.casa = ${casa}::"Casa"
      GROUP BY d."parlamentarId"
    ),
    categoria AS (
      SELECT DISTINCT ON ("parlamentarId") "parlamentarId", tipo
      FROM (
        SELECT d."parlamentarId", d.tipo, SUM(d.valor) AS v
        FROM "Despesa" d JOIN "Parlamentar" p ON p.id = d."parlamentarId"
        WHERE d.ano = ${ano} AND p.casa = ${casa}::"Casa"
        GROUP BY d."parlamentarId", d.tipo
      ) x
      ORDER BY "parlamentarId", v DESC
    ),
    votos AS (
      SELECT vt."parlamentarId", COUNT(*) AS votou
      FROM "Voto" vt JOIN "Votacao" vc ON vc.id = vt."votacaoId"
      WHERE vt.voto::text <> ALL(${SEM_VOTO}) AND vc.casa = ${casa}::"Casa" AND vc.data >= ${de} AND vc.data < ${ate}
      GROUP BY vt."parlamentarId"
    ),
    nominais AS (
      SELECT COUNT(*) AS n FROM "Votacao"
      WHERE casa = ${casa}::"Casa" AND simbolica = false AND secreta = false AND data >= ${de} AND data < ${ate}
    )
    SELECT p.id, p.nome, p.partido, p.uf, p."fotoUrl", p.ativo,
           COALESCE(g.total, 0) AS gasto, COALESCE(g.notas, 0) AS notas,
           c.tipo AS "maiorCategoria", COALESCE(v.votou, 0) AS votou, (SELECT n FROM nominais) AS nominais
    FROM "Parlamentar" p
    LEFT JOIN gasto g ON g."parlamentarId" = p.id
    LEFT JOIN categoria c ON c."parlamentarId" = p.id
    LEFT JOIN votos v ON v."parlamentarId" = p.id
    WHERE p.casa = ${casa}::"Casa"
  `);

  const linhas: LinhaRanking[] = rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    partido: r.partido,
    uf: r.uf,
    fotoUrl: r.fotoUrl,
    ativo: r.ativo,
    gasto: Number(r.gasto),
    notas: Number(r.notas),
    maiorCategoria: r.maiorCategoria,
    votou: Number(r.votou),
  }));
  return { linhas, nominais: rows.length > 0 ? Number(rows[0].nominais) : 0 };
}

export async function buscarPerfil(id: number, ano: number) {
  // Tudo em paralelo: cada ida ao banco custa ~0,7 s, e as consultas não dependem umas das outras.
  const [parlamentar, porCategoria, porMes, despesas] = await Promise.all([
    db.parlamentar.findUnique({ where: { id } }),
    db.despesa.groupBy({
      by: ["tipo"],
      where: { parlamentarId: id, ano },
      _sum: { valor: true },
      orderBy: { _sum: { valor: "desc" } },
    }),
    db.despesa.groupBy({
      by: ["mes"],
      where: { parlamentarId: id, ano },
      _sum: { valor: true },
    }),
    db.despesa.findMany({
      where: { parlamentarId: id, ano },
      orderBy: [{ dataDocumento: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      select: {
        id: true,
        tipo: true,
        fornecedor: true,
        cnpjCpf: true,
        valor: true,
        dataDocumento: true,
        urlDocumento: true,
      },
    }),
  ]);
  if (!parlamentar) return null;

  const mensal = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    valor: Number(porMes.find((m) => m.mes === i + 1)?._sum.valor ?? 0),
  }));

  return {
    parlamentar,
    categorias: porCategoria.map((c) => ({ tipo: c.tipo, valor: Number(c._sum.valor ?? 0) })),
    mensal,
    despesas: despesas.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      fornecedor: d.fornecedor,
      cnpjCpf: d.cnpjCpf,
      valor: Number(d.valor),
      data: d.dataDocumento ? d.dataDocumento.toISOString().slice(0, 10) : null,
      urlDocumento: d.urlDocumento,
    })),
  };
}

export const contarEmExercicio = (casa: CasaLegislativa) =>
  db.parlamentar.count({ where: { casa, ativo: true } });
