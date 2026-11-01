import { db } from "@/lib/db";
import type { CasaLegislativa } from "@/lib/leis";
import { SEM_VOTO } from "@/lib/queries/leis";
import type { LinhaRanking } from "@/lib/ranking";

// Quem não gastou nada no ano também entra no ranking, com gasto 0.
// `nominais` é o total de votações nominais do plenário no ano (denominador da presença).
export async function listarRanking(ano: number, casa: CasaLegislativa) {
  const doAno = { data: { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) } };
  const [parlamentares, somas, porCategoria, votos, nominais] = await Promise.all([
    db.parlamentar.findMany({ where: { casa } }),
    db.despesa.groupBy({
      by: ["parlamentarId"],
      where: { ano, parlamentar: { casa } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    db.despesa.groupBy({
      by: ["parlamentarId", "tipo"],
      where: { ano, parlamentar: { casa } },
      _sum: { valor: true },
    }),
    db.voto.groupBy({
      by: ["parlamentarId"],
      where: { voto: { notIn: SEM_VOTO }, votacao: { ...doAno, casa } },
      _count: { _all: true },
    }),
    db.votacao.count({ where: { casa, simbolica: false, secreta: false, ...doAno } }),
  ]);
  const porId = new Map(somas.map((s) => [s.parlamentarId, s]));
  const votouPorId = new Map(votos.map((v) => [v.parlamentarId, v._count._all]));

  const maior = new Map<number, { tipo: string; valor: number }>();
  for (const c of porCategoria) {
    const valor = Number(c._sum.valor ?? 0);
    if (valor > (maior.get(c.parlamentarId)?.valor ?? -Infinity)) {
      maior.set(c.parlamentarId, { tipo: c.tipo, valor });
    }
  }

  const linhas: LinhaRanking[] = parlamentares.map((p) => ({
    id: p.id,
    nome: p.nome,
    partido: p.partido,
    uf: p.uf,
    fotoUrl: p.fotoUrl,
    ativo: p.ativo,
    gasto: Number(porId.get(p.id)?._sum.valor ?? 0),
    notas: porId.get(p.id)?._count._all ?? 0,
    maiorCategoria: maior.get(p.id)?.tipo ?? null,
    votou: votouPorId.get(p.id) ?? 0,
  }));
  return { linhas, nominais };
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
