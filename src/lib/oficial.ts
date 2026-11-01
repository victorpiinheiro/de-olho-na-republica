// Recortes dos dados OFICIAIS do Impostômetro (sem projeção). Puro: roda no servidor e no navegador.
// Federal é publicado por mês; estadual só por bimestre. Por isso o recorte "mês" não existe para o estadual.

export type EsferaTela = "total" | "federal" | "estadual";
export type Granularidade = "mes" | "bimestre" | "acumulado";

export interface SerieOficial {
  esfera: "FEDERAL" | "ESTADUAL";
  uf: string; // "BR" no federal
  tributo: string;
  ano: number;
  // 12 posições (jan-dez); null onde a fonte ainda não publicou. Nunca contém projeção.
  valores: (number | null)[];
  // A preços constantes (IPCA). Só o federal tem.
  reais: (number | null)[];
}

export interface Selecao {
  esfera: EsferaTela;
  ufs: ReadonlySet<string> | null; // null = todas
  tributos: ReadonlySet<string> | null; // null = todos
}

export interface Periodo {
  n: number; // mês (1-12) ou bimestre (1-6)
  valor: number | null;
}

export interface Resultado {
  granularidade: Granularidade;
  unidade: "mes" | "bimestre"; // unidade das barras do gráfico
  periodos: Periodo[]; // todos os períodos do ano na unidade, null = ainda não publicado
  selecionado: number | null; // período escolhido (null no acumulado ou sem dado)
  mesesCobertos: number[]; // meses somados no valor principal
  valor: number | null;
  anterior: number | null; // mesmo recorte no ano anterior
  variacao: number | null; // % nominal
  variacaoReal: number | null; // % a preços constantes (só federal)
  porTributo: { tributo: string; valor: number }[];
}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function filtrar(series: SerieOficial[], sel: Selecao): SerieOficial[] {
  const federal = sel.esfera !== "estadual";
  const estadual = sel.esfera !== "federal";
  return series.filter(
    (s) =>
      (s.esfera === "FEDERAL" ? federal : estadual && (!sel.ufs || sel.ufs.has(s.uf))) &&
      (!sel.tributos || sel.tributos.has(s.tributo)),
  );
}

export function tributosDisponiveis(series: SerieOficial[], esfera: EsferaTela): string[] {
  return [...new Set(filtrar(series, { esfera, ufs: null, tributos: null }).map((s) => s.tributo))];
}

// Total mensal oficial (12 posições). Um mês só vale se TODAS as esferas incluídas já o publicaram.
function mensal(series: SerieOficial[], ano: number, campo: "valores" | "reais"): (number | null)[] {
  const porEsfera = new Map<string, SerieOficial[]>();
  for (const s of series) if (s.ano === ano) porEsfera.set(s.esfera, [...(porEsfera.get(s.esfera) ?? []), s]);
  if (porEsfera.size === 0) return Array(12).fill(null);
  return Array.from({ length: 12 }, (_, m) => {
    let total = 0;
    for (const grupo of porEsfera.values()) {
      const v = grupo.map((s) => s[campo][m]);
      if (v.some((x) => x === null)) return null;
      total += soma(v as number[]);
    }
    return total;
  });
}

// O estadual entra? Então a menor unidade é o bimestre.
export function granularidadesPermitidas(series: SerieOficial[], sel: Selecao): Granularidade[] {
  const temEstadual = filtrar(series, sel).some((s) => s.esfera === "ESTADUAL");
  return temEstadual ? ["bimestre", "acumulado"] : ["mes", "bimestre", "acumulado"];
}

export function mesesDoPeriodo(gran: Granularidade, n: number, ultimoMesCompleto: number): number[] {
  if (gran === "mes") return [n];
  if (gran === "bimestre") return [2 * n - 1, 2 * n];
  return Array.from({ length: ultimoMesCompleto }, (_, i) => i + 1);
}

export function calcular(
  series: SerieOficial[],
  sel: Selecao,
  ano: number,
  granPedida: Granularidade,
  periodoPedido: number | null,
): Resultado {
  const doRecorte = filtrar(series, sel);
  const permitidas = granularidadesPermitidas(series, sel);
  const granularidade = permitidas.includes(granPedida) ? granPedida : "bimestre";
  const unidade = permitidas.includes("mes") && granularidade !== "bimestre" ? "mes" : "bimestre";

  const meses = mensal(doRecorte, ano, "valores");
  const porBimestre = Array.from({ length: 6 }, (_, b) =>
    meses[2 * b] !== null && meses[2 * b + 1] !== null ? (meses[2 * b] as number) + (meses[2 * b + 1] as number) : null,
  );
  const periodos: Periodo[] =
    unidade === "mes"
      ? meses.map((valor, i) => ({ n: i + 1, valor }))
      : porBimestre.map((valor, i) => ({ n: i + 1, valor }));

  // Meses consecutivos publicados desde janeiro (o acumulado só soma sem buracos; estadual fecha em bimestre).
  let completos = 0;
  while (completos < 12 && meses[completos] !== null) completos++;
  if (!permitidas.includes("mes")) completos -= completos % 2;

  const unidadesGran = granularidade === "mes" ? periodos : granularidade === "bimestre" ? porBimestre.map((valor, i) => ({ n: i + 1, valor })) : [];
  const ultimo = [...unidadesGran].reverse().find((p) => p.valor !== null)?.n ?? null;
  const selecionado =
    granularidade === "acumulado"
      ? null
      : unidadesGran.find((p) => p.n === periodoPedido && p.valor !== null)?.n ?? ultimo;

  const mesesCobertos =
    granularidade === "acumulado"
      ? mesesDoPeriodo("acumulado", 0, completos)
      : selecionado === null
        ? []
        : mesesDoPeriodo(granularidade, selecionado, completos);

  const somar = (alvo: SerieOficial[], a: number, campo: "valores" | "reais") => {
    const m = mensal(alvo, a, campo);
    return mesesCobertos.length > 0 && mesesCobertos.every((x) => m[x - 1] !== null)
      ? soma(mesesCobertos.map((x) => m[x - 1] as number))
      : null;
  };

  const valor = somar(doRecorte, ano, "valores");
  const anterior = somar(doRecorte, ano - 1, "valores");
  const variacao = valor !== null && anterior !== null && anterior > 0 ? (valor / anterior - 1) * 100 : null;

  const soFederal = doRecorte.length > 0 && doRecorte.every((s) => s.esfera === "FEDERAL");
  const realAtual = soFederal ? somar(doRecorte, ano, "reais") : null;
  const realAnterior = soFederal ? somar(doRecorte, ano - 1, "reais") : null;
  const variacaoReal =
    realAtual !== null && realAnterior !== null && realAnterior > 0 ? (realAtual / realAnterior - 1) * 100 : null;

  const porTributo = [...new Set(doRecorte.map((s) => s.tributo))]
    .map((tributo) => ({ tributo, valor: somar(doRecorte.filter((s) => s.tributo === tributo), ano, "valores") }))
    .filter((t): t is { tributo: string; valor: number } => t.valor !== null)
    .sort((a, b) => b.valor - a.valor);

  return { granularidade, unidade, periodos, selecionado, mesesCobertos, valor, anterior, variacao, variacaoReal, porTributo };
}
