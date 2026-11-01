// Cálculo puro do Impostômetro (sem Prisma): roda no servidor e no navegador.
// Modelo: cada mês vale o seu total, distribuído por igual pelos segundos do mês (fuso de Brasília).

export interface MesTotal {
  mes: number; // 1-12
  valor: number; // R$
  estimado: boolean;
}

export interface LinhaArrecadacao {
  tributo: string;
  ano: number;
  mes: number;
  valor: number;
  estimado: boolean;
  valorReal: number | null;
}

// Brasília está em UTC-3 o ano todo (sem horário de verão desde 2019).
const OFFSET_BRT_MS = 3 * 3_600_000;
export const inicioDoMes = (ano: number, mes: number) => Date.UTC(ano, mes - 1, 1) + OFFSET_BRT_MS;
export const inicioDoDia = (agoraMs: number) =>
  Math.floor((agoraMs - OFFSET_BRT_MS) / 86_400_000) * 86_400_000 + OFFSET_BRT_MS;

const fimDoMes = (ano: number, mes: number) => (mes === 12 ? inicioDoMes(ano + 1, 1) : inicioDoMes(ano, mes + 1));

// Mês ainda não divulgado = mesmo mês do ano anterior × crescimento médio de cada tributo
// (soma dos meses oficiais do ano sobre a soma dos mesmos meses do ano anterior).
export function projetarMeses(anoAtual: number, linhas: LinhaArrecadacao[]): LinhaArrecadacao[] {
  const oficiais = linhas.filter((l) => !l.estimado);
  const mesesOficiais = new Set(oficiais.filter((l) => l.ano === anoAtual).map((l) => l.mes));
  if (mesesOficiais.size === 0) throw new Error(`nenhum mês oficial de ${anoAtual} para projetar`);

  const tributos = [...new Set(oficiais.map((l) => l.tributo))];
  const projecao: LinhaArrecadacao[] = [];
  for (const tributo of tributos) {
    const doTributo = oficiais.filter((l) => l.tributo === tributo);
    const valor = (ano: number, mes: number) =>
      doTributo.find((l) => l.ano === ano && l.mes === mes)?.valor;

    let atual = 0;
    let anterior = 0;
    for (const mes of mesesOficiais) {
      const a = valor(anoAtual, mes);
      const b = valor(anoAtual - 1, mes);
      if (a === undefined || b === undefined) throw new Error(`${tributo}: faltam dados de ${mes}/${anoAtual} ou do ano anterior`);
      atual += a;
      anterior += b;
    }
    if (anterior <= 0) throw new Error(`${tributo}: base do ano anterior inválida`);
    const crescimento = atual / anterior;

    for (let mes = 1; mes <= 12; mes++) {
      if (mesesOficiais.has(mes)) continue;
      const base = valor(anoAtual - 1, mes);
      if (base === undefined) throw new Error(`${tributo}: sem ${mes}/${anoAtual - 1} para projetar`);
      projecao.push({
        tributo,
        ano: anoAtual,
        mes,
        valor: Math.round(base * crescimento),
        estimado: true,
        valorReal: null,
      });
    }
  }
  return projecao;
}

// Total por mês, somando os tributos. Um mês é estimado se qualquer parcela for.
export function totaisPorMes(linhas: LinhaArrecadacao[], ano: number): MesTotal[] {
  const meses = new Map<number, MesTotal>();
  for (const l of linhas.filter((x) => x.ano === ano)) {
    const m = meses.get(l.mes) ?? { mes: l.mes, valor: 0, estimado: false };
    m.valor += l.valor;
    m.estimado = m.estimado || l.estimado;
    meses.set(l.mes, m);
  }
  return [...meses.values()].sort((a, b) => a.mes - b.mes);
}

// Acumulado no instante `agoraMs`: meses encerrados + fração decorrida do mês corrente.
export function acumuladoEm(agoraMs: number, ano: number, meses: MesTotal[]): number {
  let total = 0;
  for (const m of meses) {
    const ini = inicioDoMes(ano, m.mes);
    const fim = fimDoMes(ano, m.mes);
    if (agoraMs >= fim) total += m.valor;
    else if (agoraMs > ini) total += m.valor * ((agoraMs - ini) / (fim - ini));
  }
  return total;
}

export function mesCorrente(agoraMs: number, ano: number, meses: MesTotal[]): MesTotal | undefined {
  return meses.find((m) => agoraMs >= inicioDoMes(ano, m.mes) && agoraMs < fimDoMes(ano, m.mes));
}

export function taxaPorSegundo(agoraMs: number, ano: number, meses: MesTotal[]): number {
  const m = mesCorrente(agoraMs, ano, meses);
  return m ? m.valor / ((fimDoMes(ano, m.mes) - inicioDoMes(ano, m.mes)) / 1000) : 0;
}

// Arrecadado desde 00h (Brasília) de hoje.
export function arrecadadoHoje(agoraMs: number, ano: number, meses: MesTotal[]): number {
  return acumuladoEm(agoraMs, ano, meses) - acumuladoEm(Math.max(inicioDoDia(agoraMs), inicioDoMes(ano, 1)), ano, meses);
}

// Variação real do acumulado oficial: só meses oficiais nos dois anos, a preços constantes.
export function variacaoReal(linhas: LinhaArrecadacao[], ano: number): { variacao: number; ateMes: number } | null {
  const real = (l: LinhaArrecadacao) => (!l.estimado && l.valorReal !== null ? l.valorReal : null);
  const mesesAtual = [...new Set(linhas.filter((l) => l.ano === ano && real(l) !== null).map((l) => l.mes))];
  if (mesesAtual.length === 0) return null;
  let atual = 0;
  let anterior = 0;
  for (const l of linhas) {
    const v = real(l);
    if (v === null || !mesesAtual.includes(l.mes)) continue;
    if (l.ano === ano) atual += v;
    else if (l.ano === ano - 1) anterior += v;
  }
  return anterior > 0 ? { variacao: (atual / anterior - 1) * 100, ateMes: Math.max(...mesesAtual) } : null;
}
