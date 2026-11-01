export interface LinhaRanking {
  id: number;
  nome: string;
  partido: string;
  uf: string;
  fotoUrl: string | null;
  ativo: boolean;
  gasto: number;
  notas: number;
  maiorCategoria: string | null;
  votou: number;
}

export interface Filtros {
  busca: string;
  uf: string;
  partido: string;
  situacao: "ativos" | "todos";
  ordem: "gasto-desc" | "gasto-asc" | "nome";
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filtrarOrdenar(linhas: LinhaRanking[], f: Filtros): LinhaRanking[] {
  const busca = semAcento(f.busca.trim());
  const r = linhas.filter(
    (l) =>
      (f.situacao === "todos" || l.ativo) &&
      (!f.uf || l.uf === f.uf) &&
      (!f.partido || l.partido === f.partido) &&
      (!busca || semAcento(l.nome).includes(busca)),
  );
  const cmp = {
    "gasto-desc": (a: LinhaRanking, b: LinhaRanking) => b.gasto - a.gasto,
    "gasto-asc": (a: LinhaRanking, b: LinhaRanking) => a.gasto - b.gasto,
    nome: (a: LinhaRanking, b: LinhaRanking) => a.nome.localeCompare(b.nome, "pt-BR"),
  }[f.ordem];
  return r.sort(cmp);
}

export function resumir(linhas: LinhaRanking[]) {
  const total = linhas.reduce((s, l) => s + l.gasto, 0);
  return { total, quantidade: linhas.length, media: linhas.length ? total / linhas.length : 0 };
}
