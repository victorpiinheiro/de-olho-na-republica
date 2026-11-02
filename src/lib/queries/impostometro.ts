import { db } from "@/lib/db";
import type { DetalheEstadualDados, DetalheFederalDados } from "@/lib/detalhe";
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
  // Aberto por tributo: Federal mensal (Receita) e Estadual anual e bruto (DCA). null = ainda não carregado.
  detalhe: { federal: DetalheFederalDados | null; estadual: DetalheEstadualDados | null };
}

// Federal por tributo (Tabela I) e por base de incidência (Tabela VII) + Estadual bruto anual (DCA), em formato
// compacto: as contas vão uma vez e os valores como tuplas, para não pesar na página.
interface LinhaFed { ano: number; mes: number; codigo: string; nome: string; pai: string | null; nivel: number; valor: number }
interface LinhaBase { ano: number; ateMes: number; categoria: string; valor: number }
interface LinhaEst {
  ano: number; uf: string; codConta: string; conta: string; nivel: number;
  bruto: number; deducaoFundeb: number; deducaoTransferencias: number; outrasDeducoes: number;
}
interface LinhaArr {
  esfera: "FEDERAL" | "ESTADUAL"; uf: string; tributo: string; ano: number; mes: number;
  valor: number; estimado: boolean; valorReal: number | null;
}

// Tudo o que a página precisa, numa única ida ao banco (cada uma custa ~1 s de distância em desenvolvimento).
// O ano é o do último mês federal oficial; a arrecadação traz esse ano e o anterior.
interface Tudo {
  ano: number | null;
  populacao: number | null;
  arrecadacao: LinhaArr[];
  detalheFederal: LinhaFed[];
  base: LinhaBase[];
  estadual: LinhaEst[];
}

async function lerTudo(): Promise<Tudo> {
  const [r] = await db.$queryRaw<{ dados: Tudo }[]>`
    WITH recente AS (SELECT max(ano) AS ano FROM "Arrecadacao" WHERE esfera = 'FEDERAL' AND NOT estimado)
    SELECT jsonb_build_object(
      'ano', (SELECT ano FROM recente),
      'populacao', (SELECT valor FROM "Indicador" WHERE chave = 'populacao' ORDER BY referencia DESC LIMIT 1),
      'arrecadacao', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'esfera', a.esfera::text, 'uf', a.uf, 'tributo', a.tributo, 'ano', a.ano, 'mes', a.mes,
                 'valor', a.valor, 'estimado', a.estimado, 'valorReal', a."valorReal")), '[]'::jsonb)
        FROM "Arrecadacao" a, recente
        WHERE a.esfera IN ('FEDERAL', 'ESTADUAL') AND a.ano IN (recente.ano - 1, recente.ano)),
      'detalheFederal', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'ano', d.ano, 'mes', d.mes, 'codigo', d.codigo, 'nome', d.nome, 'pai', d.pai, 'nivel', d.nivel, 'valor', d.valor)
               ORDER BY d.ano, d.mes, d.id), '[]'::jsonb)
        FROM "ArrecadacaoFederalDetalhe" d),
      'base', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('ano', b.ano, 'ateMes', b."ateMes", 'categoria', b.categoria, 'valor', b.valor)), '[]'::jsonb)
        FROM "ArrecadacaoFederalBase" b),
      'estadual', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'ano', e.ano, 'uf', e.uf, 'codConta', e."codConta", 'conta', e.conta, 'nivel', e.nivel, 'bruto', e.bruto,
                 'deducaoFundeb', e."deducaoFundeb", 'deducaoTransferencias', e."deducaoTransferencias", 'outrasDeducoes', e."outrasDeducoes")
               ORDER BY e.ano DESC, e.uf, e."codConta"), '[]'::jsonb)
        FROM "ReceitaEstadualAnual" e)
    ) AS dados`;
  return r.dados;
}

function montarDetalhe(fed: LinhaFed[], base: LinhaBase[], est: LinhaEst[]): ImpostometroCompleto["detalhe"] {
  let federal: DetalheFederalDados | null = null;
  if (fed.length > 0) {
    const tributos: DetalheFederalDados["tributos"] = [];
    const indice = new Map<string, number>();
    for (const r of fed) {
      if (indice.has(r.codigo)) continue;
      indice.set(r.codigo, tributos.length);
      tributos.push({ codigo: r.codigo, nome: r.nome, pai: r.pai, nivel: r.nivel });
    }
    const ano = Math.max(...fed.map((r) => r.ano));
    federal = {
      ano,
      ultimoMes: Math.max(...fed.filter((r) => r.ano === ano).map((r) => r.mes)),
      tributos,
      valores: fed.map((r) => [r.ano, r.mes, indice.get(r.codigo)!, Number(r.valor)]),
      base: base.map((b) => ({ ano: b.ano, ateMes: b.ateMes, categoria: b.categoria, valor: Number(b.valor) })),
    };
  }

  let estadual: DetalheEstadualDados | null = null;
  if (est.length > 0) {
    const contas: DetalheEstadualDados["contas"] = [];
    const indice = new Map<string, number>();
    for (const r of est) {
      if (indice.has(r.codConta)) continue;
      indice.set(r.codConta, contas.length);
      contas.push({ cod: r.codConta, nome: r.conta, nivel: r.nivel });
    }
    estadual = {
      anos: [...new Set(est.map((r) => r.ano))].sort((a, b) => b - a),
      contas,
      valores: est.map((r) => [
        r.ano,
        r.uf,
        indice.get(r.codConta)!,
        Number(r.bruto),
        Number(r.deducaoFundeb),
        Number(r.deducaoTransferencias),
        Number(r.outrasDeducoes),
      ]),
    };
  }
  return { federal, estadual };
}

export async function carregarImpostometro(): Promise<ImpostometroCompleto> {
  const vazio: ImpostometroCompleto = {
    projecao: { total: null, federal: null, estadual: null },
    oficial: { ano: new Date().getFullYear(), series: [], populacao: null },
    detalhe: { federal: null, estadual: null },
  };
  const tudo = await lerTudo();
  if (tudo.ano === null) return vazio;
  const ano = tudo.ano;
  const rows = tudo.arrecadacao;
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

  const base: Base = { ano, populacao: tudo.populacao === null ? null : Number(tudo.populacao), geradoEm: Date.now() };

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
    detalhe: montarDetalhe(tudo.detalheFederal, tudo.base, tudo.estadual),
  };
}
