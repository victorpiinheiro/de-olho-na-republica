import { db } from "@/lib/db";
import type { EsferaTela, SerieOficial } from "@/lib/oficial";
import { montarSerie, variacaoReal, type LinhaArrecadacao, type MesTotal } from "@/lib/impostometro";

export interface DadosImpostometro {
  ano: number;
  meses: MesTotal[];
  ultimoMesOficial: number;
  porTributo: { tributo: string; valor: number }[];
  populacao: number | null;
  variacaoReal: { variacao: number; ateMes: number } | null;
  // Instante em que a página foi gerada: ponto de partida do contador até o navegador assumir.
  geradoEm: number;
  // Só na esfera estadual: linhas do ano por UF, para o filtro de estados recalcular no navegador.
  linhasPorUf?: Record<string, LinhaArrecadacao[]>;
}

export type { EsferaTela };
export type ImpostometroPorEsfera = Record<EsferaTela, DadosImpostometro | null>;

interface Base {
  ano: number;
  populacao: number | null;
  geradoEm: number;
}

// Monta os dados de uma esfera (ou da soma delas) a partir das linhas de Arrecadacao.
function montar(linhas: LinhaArrecadacao[], { ano, populacao, geradoEm }: Base, comVariacaoReal: boolean, limiteMes = 12): DadosImpostometro | null {
  const serie = montarSerie(linhas, ano, limiteMes);
  if (!serie) return null;
  return { ano, ...serie, populacao, variacaoReal: comVariacaoReal ? variacaoReal(linhas, ano) : null, geradoEm };
}

// Federal (Receita) e Estadual (Siconfi). Total = soma das duas. Município fora de propósito: ver CLAUDE.md.
export interface ImpostometroCompleto {
  projecao: ImpostometroPorEsfera;
  oficial: { ano: number; series: SerieOficial[]; populacao: number | null };
}

export async function carregarImpostometro(): Promise<ImpostometroCompleto> {
  const vazio: ImpostometroCompleto = {
    projecao: { total: null, federal: null, estadual: null },
    oficial: { ano: new Date().getFullYear(), series: [], populacao: null },
  };
  const recente = await db.arrecadacao.findFirst({
    where: { esfera: "FEDERAL", estimado: false },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true },
  });
  if (!recente) return vazio;
  const ano = recente.ano;

  const rows = await db.arrecadacao.findMany({
    where: { esfera: { in: ["FEDERAL", "ESTADUAL"] }, ano: { in: [ano - 1, ano] } },
  });
  const linhasDe = (esfera: "FEDERAL" | "ESTADUAL"): (LinhaArrecadacao & { uf: string })[] =>
    rows
      .filter((r) => r.esfera === esfera)
      .map((r) => ({
        uf: r.uf,
        tributo: r.tributo,
        ano: r.ano,
        mes: r.mes,
        valor: Number(r.valor),
        estimado: r.estimado,
        valorReal: r.valorReal === null ? null : Number(r.valorReal),
      }));

  const populacao = await db.indicador.findFirst({ where: { chave: "populacao" }, orderBy: { referencia: "desc" } });
  const base: Base = { ano, populacao: populacao ? Number(populacao.valor) : null, geradoEm: Date.now() };

  const federal = linhasDe("FEDERAL");
  const estadual = linhasDe("ESTADUAL");
  const dadosFederal = montar(federal, base, true);
  const dadosEstadual = montar(estadual, base, false);
  if (dadosEstadual) {
    const porUf: Record<string, LinhaArrecadacao[]> = {};
    for (const { uf, ...l } of estadual) if (l.ano === ano) (porUf[uf] ??= []).push(l);
    dadosEstadual.linhasPorUf = porUf;
  }
  // Total só existe quando as duas séries cobrem o mesmo ano completo; senão somaria períodos diferentes.
  const dadosTotal =
    dadosFederal && dadosEstadual
      ? montar([...federal, ...estadual], base, false, Math.min(dadosFederal.ultimoMesOficial, dadosEstadual.ultimoMesOficial))
      : null;

  // Só o que a fonte publicou (sem projeção), por esfera/UF/tributo/ano, para os recortes de mês e bimestre.
  const mapa = new Map<string, SerieOficial>();
  for (const r of rows) {
    if (r.estimado) continue;
    const chave = `${r.esfera}|${r.uf}|${r.tributo}|${r.ano}`;
    const serie = mapa.get(chave) ?? {
      esfera: r.esfera as SerieOficial["esfera"],
      uf: r.uf,
      tributo: r.tributo,
      ano: r.ano,
      valores: Array<number | null>(12).fill(null),
      reais: Array<number | null>(12).fill(null),
    };
    serie.valores[r.mes - 1] = Number(r.valor);
    serie.reais[r.mes - 1] = r.valorReal === null ? null : Number(r.valorReal);
    mapa.set(chave, serie);
  }

  return {
    projecao: { total: dadosTotal, federal: dadosFederal, estadual: dadosEstadual },
    oficial: { ano, series: [...mapa.values()], populacao: base.populacao },
  };
}
