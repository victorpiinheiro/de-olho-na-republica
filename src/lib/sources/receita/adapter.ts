import { COLUNAS, linhaMesSchema } from "./schemas";

export const MESES_TABELA = ["JAN", "FEV", "MAR", "ABR", "MAIO", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// Nome gravado em Arrecadacao.tributo, na ordem das colunas da Tabela III.
export const TRIBUTOS = [
  "Imposto de Renda",
  "IPI",
  "Importação e IPI vinculado",
  "Contribuições",
  "Receita previdenciária",
  "Outros",
] as const;
export type Tributo = (typeof TRIBUTOS)[number];

const COL_TOTAL_RFB = 6;
// Os valores são inteiros em R$ milhões, então cada soma pode diferir do total por arredondamento.
const TOLERANCIA_LINHA = 3;
const TOLERANCIA_ANO = 8;

export interface AnoTabela {
  ano: number;
  // índice 0 = janeiro; cada item tem as 9 colunas da tabela
  meses: number[][];
}

const RE_NUMERO = String.raw`\(?[\d.]+\)?`;
const RE_LINHA_MES = new RegExp(String.raw`^\s*(JAN|FEV|MAR|ABR|MAIO|JUN|JUL|AGO|SET|OUT|NOV|DEZ)((?:\s+${RE_NUMERO}){${COLUNAS}})\s*$`);
const RE_LINHA_TOTAL = new RegExp(String.raw`^\s*((?:\s*${RE_NUMERO}){${COLUNAS}})\s*$`);

const numeros = (s: string) => s.trim().split(/\s+/);
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Seleciona a página pelo título exato ("TABELA III" não pode casar com "TABELA III-A").
export function paginaDaTabela(textoCompleto: string, titulo: "TABELA III" | "TABELA III-A"): string {
  const re = new RegExp(String.raw`^\s*${titulo}\s*$`, "m");
  const pagina = textoCompleto.split("\f").find((p) => re.test(p));
  if (!pagina) throw new Error(`${titulo} não encontrada no relatório da Receita`);
  return pagina;
}

// No PDF o ano vem DEPOIS do bloco: meses, linha "JAN-DEZ" (ou "JAN-SET"), totais e, por fim, "2025".
export function lerTabelaMensal(pagina: string): AnoTabela[] {
  const cabecalho = pagina.split("\n").slice(0, 14).join("\n");
  for (const termo of ["I. Renda", "Contribuições", "Previdenciária", "Administradas", "Total"]) {
    if (!cabecalho.includes(termo)) throw new Error(`cabeçalho da tabela sem "${termo}": o layout mudou`);
  }

  const anos: AnoTabela[] = [];
  let meses: { nome: string; valores: number[] }[] = [];
  let totais: number[] | null = null;
  let esperaTotais = false;

  for (const linha of pagina.split("\n")) {
    const mes = RE_LINHA_MES.exec(linha);
    if (mes) {
      const { mes: nome, valores } = linhaMesSchema.parse({ mes: mes[1], valores: numeros(mes[2]) });
      meses.push({ nome, valores });
      continue;
    }
    if (/^\s*JAN-[A-Z]{3,4}\s*$/.test(linha)) {
      esperaTotais = true;
      continue;
    }
    if (esperaTotais) {
      const t = RE_LINHA_TOTAL.exec(linha);
      if (!t) throw new Error("linha de totais anuais não reconhecida");
      totais = linhaMesSchema.shape.valores.parse(numeros(t[1]));
      esperaTotais = false;
      continue;
    }
    const ano = /^\s*(\d{4})\s*$/.exec(linha);
    if (ano && meses.length > 0) {
      if (!totais) throw new Error(`ano ${ano[1]} sem linha de totais`);
      anos.push(validarAno(Number(ano[1]), meses, totais));
      meses = [];
      totais = null;
    }
  }
  if (meses.length > 0 || anos.length === 0) throw new Error("tabela mensal incompleta ou vazia");
  return anos;
}

function validarAno(ano: number, meses: { nome: string; valores: number[] }[], totais: number[]): AnoTabela {
  meses.forEach((m, i) => {
    if (m.nome !== MESES_TABELA[i]) throw new Error(`${ano}: esperado ${MESES_TABELA[i]} na posição ${i + 1}, veio ${m.nome}`);
    const categorias = soma(m.valores.slice(0, COL_TOTAL_RFB));
    if (Math.abs(categorias - m.valores[COL_TOTAL_RFB]) > TOLERANCIA_LINHA) {
      throw new Error(`${ano}/${i + 1}: categorias somam ${categorias}, total da Receita é ${m.valores[COL_TOTAL_RFB]}`);
    }
  });
  for (let c = 0; c < COLUNAS; c++) {
    const somaMeses = soma(meses.map((m) => m.valores[c]));
    if (Math.abs(somaMeses - totais[c]) > TOLERANCIA_ANO) {
      throw new Error(`${ano}: coluna ${c} soma ${somaMeses} nos meses, mas o total anual é ${totais[c]}`);
    }
  }
  return { ano, meses: meses.map((m) => m.valores) };
}

export interface ArrecadacaoNossa {
  esfera: "FEDERAL";
  tributo: Tributo;
  ano: number;
  mes: number;
  valor: number; // R$
  estimado: false;
  valorReal: number; // R$ a preços do último mês divulgado
}

const MILHAO = 1_000_000;

// Junta a tabela a preços correntes (III) com a a preços constantes (III-A), mês a mês.
export function toArrecadacoes(
  correntes: AnoTabela[],
  constantes: AnoTabela[],
  anos: number[],
): ArrecadacaoNossa[] {
  const linhas: ArrecadacaoNossa[] = [];
  for (const ano of anos) {
    const nom = correntes.find((a) => a.ano === ano);
    const real = constantes.find((a) => a.ano === ano);
    if (!nom || !real) throw new Error(`ano ${ano} ausente nas tabelas III/III-A`);
    if (nom.meses.length !== real.meses.length) {
      throw new Error(`${ano}: III tem ${nom.meses.length} meses e III-A tem ${real.meses.length}`);
    }
    nom.meses.forEach((valores, i) => {
      TRIBUTOS.forEach((tributo, c) => {
        linhas.push({
          esfera: "FEDERAL",
          tributo,
          ano,
          mes: i + 1,
          valor: valores[c] * MILHAO,
          estimado: false,
          valorReal: real.meses[i][c] * MILHAO,
        });
      });
    });
  }
  return linhas;
}
