export const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const inteiro = (n: number) => n.toLocaleString("pt-BR");

// Datas guardadas em UTC; a tela mostra no fuso de Brasília.
export const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Datas só com dia (coluna DATE) ficam em 00:00 UTC; no fuso de Brasília cairiam no dia anterior.
export const dataBrDia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const brlInteiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// R$ 139,2 mi · R$ 412 mil · R$ 980
export function brlCompacto(n: number): string {
  const um = (v: number, sufixo: string) =>
    `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${sufixo}`;
  if (Math.abs(n) >= 1e6) return um(n / 1e6, " mi");
  if (Math.abs(n) >= 1e4) return um(n / 1e3, " mil");
  return brlInteiro(n);
}

// A origem manda "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR." em caixa alta e com ponto final.
export function rotuloCategoria(tipo: string): string {
  const t = tipo.trim().replace(/\.$/, "").replace(/\s*,\s*/g, ", ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// A origem preenche "000.000.000/0000-1" quando não há documento do fornecedor.
export function documentoFornecedor(cnpjCpf: string | null): string | null {
  const digitos = (cnpjCpf ?? "").replace(/\D/g, "");
  // 12+ zeros à esquerda é o placeholder; o CNPJ real do Banco do Brasil (00.000.000/0001-91) tem 11.
  return digitos && !/^0+$/.test(digitos) && !/^0{12,}/.test(digitos) ? cnpjCpf : null;
}

// 47,0% · usa 1 casa, como na tela de eleições.
export const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// 156,4 mi · 412 mil · 980
export function milhoes(n: number): string {
  const um = (v: number, sufixo: string) =>
    `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${sufixo}`;
  if (Math.abs(n) >= 1e6) return um(n / 1e6, " mi");
  if (Math.abs(n) >= 1e4) return um(n / 1e3, " mil");
  return inteiro(n);
}

// +10,1 p.p. · −1,7 p.p. (sinal de menos tipográfico)
export function pontos(n: number): string {
  const r = Math.round(n * 10) / 10;
  const abs = Math.abs(r).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${abs} p.p.`;
}

// R$ 2,3 tri · R$ 8,5 bi · R$ 139,2 mi · R$ 412 mil
export function brlGrande(n: number): string {
  const um = (v: number, sufixo: string) =>
    `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${sufixo}`;
  if (Math.abs(n) >= 1e12) return um(n / 1e12, "tri");
  if (Math.abs(n) >= 1e9) return um(n / 1e9, "bi");
  return brlCompacto(n);
}

export const MESES_COMPLETOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Fatia de um todo. Abaixo de 1% uma casa vira "0,0%" e parece que não houve nada:
// mostra casas até aparecer o primeiro dígito diferente de zero.
export function pctFatia(parte: number, todo: number): string {
  if (todo <= 0) return "—";
  const n = (parte / todo) * 100;
  if (n <= 0 || n >= 0.95) return pct(n);
  if (n < 0.001) return "<0,001%";
  const casas = Math.min(3, Math.max(2, 1 - Math.floor(Math.log10(n))));
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
