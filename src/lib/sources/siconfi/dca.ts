import type { LinhaDca } from "./schemas";

// Receita tributária anual de um estado, a partir da DCA Anexo I-C (Tesouro). Diferente do RREO, que traz o valor
// LÍQUIDO de deduções (FUNDEB, repasses aos municípios), a DCA traz o BRUTO e as deduções em colunas separadas.
// Só interessa a árvore de tributos: 1.1.1 (impostos), 1.1.2 (taxas) e 1.1.3 (contribuição de melhoria), sob o total 1.1.0.

const COL_BRUTO = "Receitas Brutas Realizadas";
const COL_FUNDEB = "Deduções - FUNDEB";
const COL_TRANSFERENCIAS = "Deduções - Transferências Constitucionais";
const COL_OUTRAS = "Outras Deduções da Receita";
const COLUNAS = new Set([COL_BRUTO, COL_FUNDEB, COL_TRANSFERENCIAS, COL_OUTRAS]);

const RE_CONTA_TRIBUTO = /^RO1\.1\.[0-3]\.\d{1,2}\.\d{2}\.\d\.\d$/;
const TOLERANCIA = 2; // R$

export interface ReceitaEstadual {
  ano: number;
  uf: string;
  codConta: string; // "RO1.1.1.4.50.1.0"
  conta: string; // "Imposto sobre Operações Relativas à Circulação de Mercadorias..."
  nivel: number; // 0 = total de impostos, taxas e contribuições; 1 = impostos/taxas; ...
  bruto: number;
  deducaoFundeb: number;
  deducaoTransferencias: number;
  outrasDeducoes: number;
}

const segmentos = (cod: string) => cod.slice(2).split(".").map(Number);

function ultimoNaoZero(cod: string): number {
  const s = segmentos(cod);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== 0) return i;
  return -1;
}

// Pai = a mesma conta com o último segmento não nulo zerado ("...4.50.1.0" → "...4.50.0.0").
export function contaPai(cod: string): string | null {
  const i = ultimoNaoZero(cod);
  if (i <= 1) return null; // 1.1 é o topo que nos interessa
  const partes = cod.slice(2).split(".");
  partes[i] = "0".repeat(partes[i].length); // o 5º segmento tem 2 dígitos ("00"), os outros 1
  return `RO${partes.join(".")}`;
}

// "1.1.1.4.50.1.0 - Imposto sobre ..." → "Imposto sobre ..."
const limparNome = (conta: string) => conta.replace(/^[\d.]+\s*-\s*/, "").trim();

export function toReceitaEstadual(linhas: LinhaDca[], ano: number, uf: string): ReceitaEstadual[] {
  const porConta = new Map<string, ReceitaEstadual>();
  const vistos = new Set<string>();

  for (const l of linhas) {
    if (!RE_CONTA_TRIBUTO.test(l.cod_conta) || !COLUNAS.has(l.coluna)) continue;
    if (l.exercicio !== ano || l.uf !== uf) throw new Error(`linha de ${l.uf}/${l.exercicio} em resposta de ${uf}/${ano}`);
    const chave = `${l.cod_conta}|${l.coluna}`;
    if (vistos.has(chave)) throw new Error(`DCA ${uf}/${ano}: ${l.cod_conta} repetida na coluna "${l.coluna}"`);
    vistos.add(chave);

    const atual =
      porConta.get(l.cod_conta) ??
      {
        ano,
        uf,
        codConta: l.cod_conta,
        conta: limparNome(l.conta),
        nivel: ultimoNaoZero(l.cod_conta) - 1,
        bruto: 0,
        deducaoFundeb: 0,
        deducaoTransferencias: 0,
        outrasDeducoes: 0,
      };
    const v = l.valor ?? 0;
    if (l.coluna === COL_BRUTO) atual.bruto = v;
    else if (l.coluna === COL_FUNDEB) atual.deducaoFundeb = v;
    else if (l.coluna === COL_TRANSFERENCIAS) atual.deducaoTransferencias = v;
    else atual.outrasDeducoes = v;
    porConta.set(l.cod_conta, atual);
  }

  const contas = [...porConta.values()].sort((a, b) => a.codConta.localeCompare(b.codConta));
  validar(contas, uf, ano);
  return contas;
}

export const liquido = (r: Pick<ReceitaEstadual, "bruto" | "deducaoFundeb" | "deducaoTransferencias" | "outrasDeducoes">) =>
  r.bruto - r.deducaoFundeb - r.deducaoTransferencias - r.outrasDeducoes;

function validar(contas: ReceitaEstadual[], uf: string, ano: number) {
  for (const topo of ["RO1.1.1.0.00.0.0", "RO1.1.2.0.00.0.0"]) {
    if (!contas.some((c) => c.codConta === topo)) throw new Error(`DCA ${uf}/${ano} sem a conta ${topo}: a estrutura mudou`);
  }
  const porCodigo = new Map(contas.map((c) => [c.codConta, c]));
  const filhos = new Map<string, ReceitaEstadual[]>();
  for (const c of contas) {
    const pai = contaPai(c.codConta);
    if (pai && porCodigo.has(pai)) filhos.set(pai, [...(filhos.get(pai) ?? []), c]);
  }
  // Filhos somam o pai, no bruto e em cada dedução.
  for (const [pai, lista] of filhos) {
    const p = porCodigo.get(pai)!;
    for (const campo of ["bruto", "deducaoFundeb", "deducaoTransferencias", "outrasDeducoes"] as const) {
      const soma = lista.reduce((s, f) => s + f[campo], 0);
      if (Math.abs(soma - p[campo]) > TOLERANCIA) {
        throw new Error(`DCA ${uf}/${ano}: ${pai} (${campo}) é ${p[campo]}, mas as partes somam ${soma}`);
      }
    }
  }
}
