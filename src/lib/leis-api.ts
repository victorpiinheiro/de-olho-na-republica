import { ABAS, type Aba } from "./leis";

// Parâmetros de GET /api/leis. Só aceita o que a tela pode pedir: nada vai direto para a consulta sem passar por aqui.
export const MAX_PAGINAS = 60; // 60 × 100 = 6.000 itens: bem acima do que existe, e impede varredura sem fim

export const BUSCA_MIN = 2;
export const BUSCA_MAX = 80;
export const MAX_TERMOS = 6;

export interface ParametrosLeis {
  aba: Aba;
  pagina: number; // 0 = primeira
  ano: number | null;
  busca: string | null; // texto digitado (já limpo); null = sem busca
  autor: number | null; // id do parlamentar (tabela Parlamentar) que assina a proposição; null = qualquer autor
}

// Para comparar sem se importar com acento, maiúscula ou ponto de milhar ("14.597" = "14597"). O banco faz a mesma
// conta (queries/leis.ts), e o teste confere que as duas dão o mesmo resultado.
export const normalizarBusca = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\./g, "");

// Cada palavra precisa aparecer (em qualquer ordem) no código, na norma, na ementa ou nos autores.
export function termosDaBusca(busca: string): string[] {
  return [...new Set(normalizarBusca(busca).split(/\s+/).filter(Boolean))].slice(0, MAX_TERMOS);
}

export type ResultadoParametros = { ok: true; valor: ParametrosLeis } | { ok: false; motivo: string };

export function lerParametrosLeis(p: URLSearchParams): ResultadoParametros {
  const aba = ABAS.find((a) => a.chave === p.get("aba"));
  if (!aba) return { ok: false, motivo: "aba inválida" };

  const textoPagina = p.get("pagina") ?? "0";
  if (!/^\d{1,3}$/.test(textoPagina) || Number(textoPagina) > MAX_PAGINAS) return { ok: false, motivo: `pagina deve ser de 0 a ${MAX_PAGINAS}` };

  // eslint-disable-next-line no-control-regex
  const busca = (p.get("q") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (busca !== "" && (busca.length < BUSCA_MIN || busca.length > BUSCA_MAX)) {
    return { ok: false, motivo: `a busca deve ter de ${BUSCA_MIN} a ${BUSCA_MAX} caracteres` };
  }

  const textoAno = p.get("ano");
  let ano: number | null = null;
  if (textoAno !== null && textoAno !== "" && textoAno !== "todos") {
    if (!/^\d{4}$/.test(textoAno) || Number(textoAno) < 2000 || Number(textoAno) > 2100) return { ok: false, motivo: "ano inválido" };
    ano = Number(textoAno);
  }

  const textoAutor = p.get("autor");
  let autor: number | null = null;
  if (textoAutor !== null && textoAutor !== "") {
    if (!/^\d{1,9}$/.test(textoAutor) || Number(textoAutor) < 1) return { ok: false, motivo: "autor inválido" };
    autor = Number(textoAutor);
  }
  return { ok: true, valor: { aba: aba.chave, pagina: Number(textoPagina), ano, busca: busca === "" ? null : busca, autor } };
}
