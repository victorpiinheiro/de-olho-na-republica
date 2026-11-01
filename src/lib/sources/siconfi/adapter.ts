import type { LinhaRreo } from "./schemas";

// Conta do RREO → nome gravado em Arrecadacao.tributo.
export const TRIBUTOS_ESTADUAIS = {
  Impostos: "Impostos estaduais",
  Taxas: "Taxas estaduais",
} as const;
export type ContaRreo = keyof typeof TRIBUTOS_ESTADUAIS;
export const CONTAS = Object.keys(TRIBUTOS_ESTADUAIS) as ContaRreo[];

const COLUNA_BIMESTRE = "No Bimestre (b)";
const ROTULO = "Padrão";

export type ReceitaBimestre = Record<ContaRreo, number>;

// Receita realizada no bimestre de um ente (R$), lida da coluna "No Bimestre (b)".
export function receitaDoBimestre(linhas: LinhaRreo[], ano: number, bimestre: number): ReceitaBimestre {
  const out = {} as ReceitaBimestre;
  for (const conta of CONTAS) {
    const achadas = linhas.filter(
      (l) => l.cod_conta === conta && l.rotulo === ROTULO && l.coluna === COLUNA_BIMESTRE,
    );
    if (achadas.length !== 1) {
      throw new Error(`conta ${conta} (${COLUNA_BIMESTRE}): esperava 1 linha, vieram ${achadas.length}`);
    }
    const l = achadas[0];
    if (l.exercicio !== ano || l.periodo !== bimestre) {
      throw new Error(`conta ${conta}: veio ${l.exercicio}/${l.periodo}, esperava ${ano}/${bimestre}`);
    }
    if (l.valor === null) throw new Error(`conta ${conta}: valor nulo`);
    out[conta] = l.valor;
  }
  return out;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export interface ArrecadacaoEstadual {
  esfera: "ESTADUAL";
  uf: string;
  tributo: string;
  ano: number;
  mes: number;
  valor: number;
  estimado: false;
  valorReal: null;
}

// O RREO é bimestral e o Impostômetro é mensal: cada bimestre vira dois meses de valor igual
// (o segundo leva o resto do arredondamento, para a soma fechar).
export function bimestreParaMeses(uf: string, ano: number, bimestre: number, receita: ReceitaBimestre): ArrecadacaoEstadual[] {
  return CONTAS.flatMap((conta) => {
    const total = receita[conta];
    const primeiro = centavos(total / 2);
    return [
      { mes: 2 * bimestre - 1, valor: primeiro },
      { mes: 2 * bimestre, valor: centavos(total - primeiro) },
    ].map(({ mes, valor }) => ({
      esfera: "ESTADUAL" as const,
      uf,
      tributo: TRIBUTOS_ESTADUAIS[conta],
      ano,
      mes,
      valor,
      estimado: false as const,
      valorReal: null,
    }));
  });
}
