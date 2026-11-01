import { db } from "@/lib/db";
import { totaisPorMes, variacaoReal, type LinhaArrecadacao, type MesTotal } from "@/lib/impostometro";

export interface DadosImpostometro {
  ano: number;
  meses: MesTotal[];
  ultimoMesOficial: number;
  porTributo: { tributo: string; valor: number }[];
  populacao: number | null;
  variacaoReal: { variacao: number; ateMes: number } | null;
  // Instante em que a página foi gerada: ponto de partida do contador até o navegador assumir.
  geradoEm: number;
}

// Só tributos federais por enquanto (não há fonte para Estadual e Municipal).
export async function carregarImpostometro(): Promise<DadosImpostometro | null> {
  const recente = await db.arrecadacao.findFirst({
    where: { esfera: "FEDERAL", estimado: false },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true, mes: true },
  });
  if (!recente) return null;

  const rows = await db.arrecadacao.findMany({
    where: { esfera: "FEDERAL", ano: { in: [recente.ano - 1, recente.ano] } },
  });
  const linhas: LinhaArrecadacao[] = rows.map((r) => ({
    tributo: r.tributo,
    ano: r.ano,
    mes: r.mes,
    valor: Number(r.valor),
    estimado: r.estimado,
    valorReal: r.valorReal === null ? null : Number(r.valorReal),
  }));

  const meses = totaisPorMes(linhas, recente.ano);
  if (meses.length !== 12) return null; // projeção incompleta: melhor não mostrar números parciais

  const porTributo = new Map<string, number>();
  for (const l of linhas) {
    if (l.ano === recente.ano && !l.estimado) {
      porTributo.set(l.tributo, (porTributo.get(l.tributo) ?? 0) + l.valor);
    }
  }

  const populacao = await db.indicador.findFirst({
    where: { chave: "populacao" },
    orderBy: { referencia: "desc" },
  });

  return {
    ano: recente.ano,
    meses,
    ultimoMesOficial: recente.mes,
    porTributo: [...porTributo].map(([tributo, valor]) => ({ tributo, valor })).sort((a, b) => b.valor - a.valor),
    populacao: populacao ? Number(populacao.valor) : null,
    variacaoReal: variacaoReal(linhas, recente.ano),
    geradoEm: Date.now(),
  };
}
