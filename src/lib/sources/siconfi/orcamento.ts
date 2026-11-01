import type { LinhaDespesa } from "./schemas";

// Classificação funcional da despesa pública (Portaria MOG 42/1999, fixa por lei). Serve só para
// separar função de subfunção, que a fonte entrega na mesma coluna: a função vem primeiro, depois as suas subfunções.
export const FUNCOES = [
  "Legislativa", "Judiciária", "Essencial à Justiça", "Administração", "Defesa Nacional", "Segurança Pública",
  "Relações Exteriores", "Assistência Social", "Previdência Social", "Saúde", "Trabalho", "Educação", "Cultura",
  "Direitos da Cidadania", "Urbanismo", "Habitação", "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia",
  "Agricultura", "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações", "Energia", "Transporte",
  "Desporto e Lazer", "Encargos Especiais", "Reserva de Contingência",
] as const;

const ROTULO = "Total das Despesas Exceto Intra-Orçamentárias";
const TOTAL = "DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)";
const COLUNAS = {
  dotacaoInicial: "DOTAÇÃO INICIAL",
  dotacaoAtualizada: "DOTAÇÃO ATUALIZADA (a)",
  empenhado: "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)",
  liquidado: "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)",
} as const;
type Campo = keyof typeof COLUNAS;

// Despesas intra-orçamentárias (entre órgãos do próprio governo) ficam de fora para não contar duas vezes.
const FIM = (conta: string) => conta.startsWith("DESPESAS (INTRA") || conta.startsWith("TOTAL (III)");

// R$ 1 de tolerância por arredondamento da fonte, com folga para somas de dezenas de linhas.
const TOLERANCIA = 1000;

export interface DespesaNossa {
  funcao: string;
  subfuncao: string; // "" = total da função
  dotacaoInicial: number | null;
  dotacaoAtualizada: number | null;
  empenhado: number | null;
  liquidado: number | null;
  ordem: number;
}

export interface OrcamentoUniao {
  total: { dotacaoAtualizada: number; empenhado: number; liquidado: number };
  linhas: DespesaNossa[];
}

export function toDespesas(linhas: LinhaDespesa[], ano: number, bimestre: number): OrcamentoUniao {
  const doBloco = linhas.filter((l) => l.rotulo === ROTULO);
  const errado = doBloco.find((l) => l.exercicio !== ano || l.periodo !== bimestre);
  if (errado) throw new Error(`veio ${errado.exercicio}/${errado.periodo}, esperava ${ano}/${bimestre}`);

  // valor[coluna][conta]; nomes de conta são únicos dentro de cada coluna.
  const valor = {} as Record<Campo, Map<string, number | null>>;
  for (const campo of Object.keys(COLUNAS) as Campo[]) {
    const m = new Map<string, number | null>();
    for (const l of doBloco.filter((x) => x.coluna === COLUNAS[campo])) {
      if (m.has(l.conta)) throw new Error(`conta repetida em "${COLUNAS[campo]}": ${l.conta}`);
      m.set(l.conta, l.valor);
    }
    if (m.size === 0) throw new Error(`coluna ausente: ${COLUNAS[campo]}`);
    valor[campo] = m;
  }

  // A ordem oficial vem da coluna de dotação atualizada (todas as contas têm valor nela).
  const ordenadas = doBloco.filter((l) => l.coluna === COLUNAS.dotacaoAtualizada).map((l) => l.conta);
  if (ordenadas[0] !== TOTAL) throw new Error(`primeira linha inesperada: ${ordenadas[0]}`);

  const out: DespesaNossa[] = [];
  let funcao: string | null = null;
  for (const conta of ordenadas.slice(1)) {
    if (FIM(conta)) break;
    const ehFuncao = (FUNCOES as readonly string[]).includes(conta);
    if (ehFuncao) funcao = conta;
    if (!funcao) throw new Error(`conta antes de qualquer função: ${conta}`);
    out.push({
      funcao,
      subfuncao: ehFuncao ? "" : conta,
      dotacaoInicial: valor.dotacaoInicial.get(conta) ?? null,
      dotacaoAtualizada: valor.dotacaoAtualizada.get(conta) ?? null,
      empenhado: valor.empenhado.get(conta) ?? null,
      liquidado: valor.liquidado.get(conta) ?? null,
      ordem: out.length,
    });
  }

  const funcoes = out.filter((l) => l.subfuncao === "");
  if (funcoes.length < 25) throw new Error(`só ${funcoes.length} funções: estrutura da fonte mudou`);

  // Confere a estrutura: as subfunções somam a função, e as funções somam o total. Falha alto em vez de gravar errado.
  for (const campo of ["dotacaoAtualizada", "empenhado", "liquidado"] as const) {
    for (const f of funcoes) {
      const subs = out.filter((l) => l.funcao === f.funcao && l.subfuncao !== "");
      if (subs.length === 0) continue;
      const soma = subs.reduce((s, l) => s + (l[campo] ?? 0), 0);
      if (Math.abs(soma - (f[campo] ?? 0)) > TOLERANCIA) {
        throw new Error(`${f.funcao} (${campo}): subfunções somam ${soma}, função tem ${f[campo]}`);
      }
    }
    const somaFuncoes = funcoes.reduce((s, l) => s + (l[campo] ?? 0), 0);
    const total = valor[campo].get(TOTAL) ?? 0;
    if (Math.abs(somaFuncoes - total) > TOLERANCIA) {
      throw new Error(`funções (${campo}) somam ${somaFuncoes}, total da fonte é ${total}`);
    }
  }

  return {
    total: {
      dotacaoAtualizada: valor.dotacaoAtualizada.get(TOTAL) ?? 0,
      empenhado: valor.empenhado.get(TOTAL) ?? 0,
      liquidado: valor.liquidado.get(TOTAL) ?? 0,
    },
    linhas: out,
  };
}
