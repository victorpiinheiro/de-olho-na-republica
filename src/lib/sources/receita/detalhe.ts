import { milhoesBr } from "./schemas";

// Tabela I do relatório mensal da Receita (arrecadação por tributo, R$ milhões) e Tabela VII (por base de
// incidência). Layout confirmado nos relatórios de jan/2026, mar/2026, set/2026 e nos de 2025.
// Cada Tabela I traz 3 colunas: o mês do relatório, o mês anterior e o mesmo mês do ano anterior.

const MILHAO = 1_000_000;
const TOLERANCIA = 3; // valores inteiros em R$ milhões: cada soma pode diferir do total por arredondamento

const NOMES_MES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

export interface NoTributo {
  codigo: string;
  nome: string;
}

// Rótulo do PDF → código estável e nome exibido. Rótulo desconhecido quebra o job (o layout mudou).
const ROTULOS: Record<string, NoTributo> = {
  "IMPOSTO SOBRE IMPORTAÇÃO": { codigo: "importacao", nome: "Imposto de Importação" },
  "I.P.I-TOTAL": { codigo: "ipi", nome: "IPI" },
  "I.P.I-FUMO": { codigo: "ipi-fumo", nome: "Fumo" },
  "I.P.I-BEBIDAS": { codigo: "ipi-bebidas", nome: "Bebidas" },
  "I.P.I-AUTOMÓVEIS": { codigo: "ipi-automoveis", nome: "Automóveis" },
  "I.P.I-VINCULADO À IMPORTAÇÃO": { codigo: "ipi-vinculado", nome: "Vinculado à importação" },
  "I.P.I-OUTROS": { codigo: "ipi-outros", nome: "Outros produtos" },
  "IMPOSTO SOBRE A RENDA-TOTAL": { codigo: "ir", nome: "Imposto de Renda" },
  "I.RENDA-PESSOA FÍSICA": { codigo: "irpf", nome: "Pessoa física" },
  "I.RENDA-PESSOA JURÍDICA": { codigo: "irpj", nome: "Pessoa jurídica" },
  "I.RENDA-RETIDO NA FONTE": { codigo: "irrf", nome: "Retido na fonte" },
  "I.R.R.F-RENDIMENTOS DO TRABALHO": { codigo: "irrf-trabalho", nome: "Rendimentos do trabalho" },
  "I.R.R.F-RENDIMENTOS DE CAPITAL": { codigo: "irrf-capital", nome: "Rendimentos de capital" },
  "I.R.R.F-RENDIMENTOS DE RESIDENTES NO EXTERIOR": { codigo: "irrf-exterior", nome: "Residentes no exterior" },
  "I.R.R.F-OUTROS RENDIMENTOS": { codigo: "irrf-outros", nome: "Outros rendimentos" },
  "IOF - I. S/ OPERAÇÕES FINANCEIRAS": { codigo: "iof", nome: "IOF" },
  "ITR - I. TERRITORIAL RURAL": { codigo: "itr", nome: "ITR" },
  "COFINS - CONTRIB. P/ A SEGURIDADE SOCIAL": { codigo: "cofins", nome: "COFINS" },
  "CONTRIBUIÇÃO PARA O PIS/PASEP": { codigo: "pis", nome: "PIS/PASEP" },
  "CSLL - CONTRIB. SOCIAL S/ LUCRO LÍQUIDO": { codigo: "csll", nome: "CSLL" },
  "CIDE-COMBUSTÍVEIS": { codigo: "cide", nome: "CIDE-Combustíveis" },
  "PSS - CONTRIB. DO PLANO DE SEGURIDADE DO SERVIDOR": { codigo: "pss", nome: "PSS (servidores)" },
  "OUTRAS RECEITAS ADMINISTRADAS": { codigo: "outras", nome: "Outras receitas administradas" },
};
// Aparecem sob mais de um tributo (PJ, COFINS, PIS, CSLL): o código leva o do pai.
const SUBDIVISOES: Record<string, { sufixo: string; nome: string }> = {
  "ENTIDADES FINANCEIRAS": { sufixo: "financeiras", nome: "Entidades financeiras" },
  "DEMAIS EMPRESAS": { sufixo: "demais", nome: "Demais empresas" },
};

export const PREVIDENCIARIA: NoTributo = { codigo: "previdenciaria", nome: "Receita previdenciária" };

export interface ColunaTempo {
  ano: number;
  mes: number;
}

export interface LinhaTributo extends NoTributo {
  pai: string | null;
  nivel: number;
  valores: number[]; // R$, uma posição por coluna (mês do relatório, mês anterior, mesmo mês do ano anterior)
}

export interface TabelaI {
  colunas: ColunaTempo[];
  linhas: LinhaTributo[]; // inclui a Receita previdenciária como nível 0
}

const NUM = String.raw`(\(?[\d.]+\)?|-)`;
const RE_LINHA = new RegExp(String.raw`^(\s*)(\S.*?\S)\s{2,}${NUM}\s+${NUM}\s+${NUM}\s+\S+\s+\S+\s*$`);

const numero = (s: string) => (s === "-" ? 0 : milhoesBr.parse(s));
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function lerColunas(linhas: string[]): ColunaTempo[] {
  const iAnos = linhas.findIndex((l) => /^\s*\d{4}\s+\d{4}\s+VARIA/.test(l));
  const iMeses = linhas.findIndex((l, i) => i > iAnos && l.trim().split(/\s+/).length === 3 && l.trim().split(/\s+/).every((p) => NOMES_MES.includes(p)));
  if (iAnos < 0 || iMeses < 0) throw new Error("cabeçalho da Tabela I sem anos e meses: o layout mudou");
  const ano = Number(linhas[iAnos].trim().split(/\s+/)[0]);
  const [m1, m2, m3] = linhas[iMeses].trim().split(/\s+/).map((n) => NOMES_MES.indexOf(n) + 1);
  const anterior = m1 === 1 ? 12 : m1 - 1;
  if (m2 !== anterior || m3 !== m1) throw new Error(`colunas da Tabela I inesperadas: ${linhas[iMeses].trim()}`);
  return [
    { ano, mes: m1 },
    { ano: m1 === 1 ? ano - 1 : ano, mes: m2 },
    { ano: ano - 1, mes: m3 },
  ];
}

export function lerTabelaI(pagina: string): TabelaI {
  const linhasPagina = pagina.split("\n");
  const colunas = lerColunas(linhasPagina);

  const linhas: LinhaTributo[] = [];
  const pilha: { indent: number; codigo: string; nivel: number }[] = [];
  const totais: Record<string, number[]> = {};

  for (const bruta of linhasPagina) {
    const m = RE_LINHA.exec(bruta);
    if (!m) continue;
    const indent = m[1].length;
    const rotulo = m[2];
    const valores = [m[3], m[4], m[5]].map(numero);

    const total = /\[([A-E])\]/.exec(rotulo);
    if (total) {
      totais[total[1]] = valores;
      continue;
    }
    while (pilha.length > 0 && pilha[pilha.length - 1].indent >= indent) pilha.pop();
    const pai = pilha[pilha.length - 1];
    const sub = SUBDIVISOES[rotulo];
    const no = sub && pai ? { codigo: `${pai.codigo}-${sub.sufixo}`, nome: sub.nome } : ROTULOS[rotulo];
    if (!no) throw new Error(`tributo desconhecido na Tabela I: "${rotulo}" (o layout mudou?)`);

    const nivel = pai ? pai.nivel + 1 : 0;
    linhas.push({ ...no, pai: pai?.codigo ?? null, nivel, valores: valores.map((v) => v * MILHAO) });
    pilha.push({ indent, codigo: no.codigo, nivel });
  }

  for (const letra of ["A", "B", "C"]) if (!totais[letra]) throw new Error(`Tabela I sem a linha de total [${letra}]`);
  validarTabelaI(linhas, totais);

  linhas.push({ ...PREVIDENCIARIA, pai: null, nivel: 0, valores: totais.B.map((v) => v * MILHAO) });
  return { colunas, linhas };
}

function validarTabelaI(linhas: LinhaTributo[], totais: Record<string, number[]>) {
  const emMilhoes = (v: number) => Math.round(v / MILHAO);
  for (let c = 0; c < 3; c++) {
    // filhos somam o pai
    for (const pai of linhas) {
      const filhos = linhas.filter((l) => l.pai === pai.codigo);
      if (filhos.length === 0) continue;
      const s = soma(filhos.map((f) => emMilhoes(f.valores[c])));
      if (Math.abs(s - emMilhoes(pai.valores[c])) > TOLERANCIA) {
        throw new Error(`Tabela I, coluna ${c + 1}: ${pai.nome} é ${emMilhoes(pai.valores[c])} mas as partes somam ${s}`);
      }
    }
    // tributos do nível 0 somam o subtotal [A]; A + previdenciária = administradas pela RFB [C]
    const topo = soma(linhas.filter((l) => l.nivel === 0).map((l) => emMilhoes(l.valores[c])));
    if (Math.abs(topo - totais.A[c]) > TOLERANCIA) {
      throw new Error(`Tabela I, coluna ${c + 1}: tributos somam ${topo}, o subtotal [A] é ${totais.A[c]}`);
    }
    if (Math.abs(totais.A[c] + totais.B[c] - totais.C[c]) > TOLERANCIA) {
      throw new Error(`Tabela I, coluna ${c + 1}: [A]+[B] não fecha com [C]`);
    }
  }
}

// ---- Tabela VII: arrecadação por base de incidência (anual; o último ano vai até o mês do relatório) ----

export const CATEGORIAS_BASE = ["Renda e propriedade", "Folha de salários", "Bens e serviços", "Transações financeiras", "Outros"] as const;
export type CategoriaBase = (typeof CATEGORIAS_BASE)[number];

export interface AnoBase {
  ano: number;
  valores: Record<CategoriaBase, number>; // R$
  total: number; // R$
}

export function lerTabelaVII(pagina: string): AnoBase[] {
  const corpo = pagina.split(/^\s*TABELA VII-A\s*$/m)[0];
  for (const termo of ["RENDA E PROPRIEDADE", "FOLHA DE SALÁRIOS", "BENS E SERVIÇOS", "TRANSAÇÕES FINANCEIRAS", "OUTROS", "TOTAL"]) {
    if (!corpo.includes(termo)) throw new Error(`cabeçalho da Tabela VII sem "${termo}": o layout mudou`);
  }
  const anos: AnoBase[] = [];
  for (const linha of corpo.split("\n")) {
    const t = linha.trim().split(/\s+/);
    if (!/^\d{4}$/.test(t[0]) || t.length !== 19) continue;
    // 6 grupos (5 categorias + total) de 3 colunas: valor, % do total, variação sobre o ano anterior
    const v = Array.from({ length: 6 }, (_, g) => milhoesBr.parse(t[1 + 3 * g]));
    if (Math.abs(soma(v.slice(0, 5)) - v[5]) > 5) throw new Error(`Tabela VII, ${t[0]}: categorias somam ${soma(v.slice(0, 5))}, total ${v[5]}`);
    anos.push({
      ano: Number(t[0]),
      valores: Object.fromEntries(CATEGORIAS_BASE.map((c, i) => [c, v[i] * MILHAO])) as Record<CategoriaBase, number>,
      total: v[5] * MILHAO,
    });
  }
  if (anos.length === 0) throw new Error("Tabela VII sem linhas de ano");
  return anos;
}
