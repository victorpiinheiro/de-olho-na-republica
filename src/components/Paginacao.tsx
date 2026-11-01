"use client";

import { inteiro } from "@/lib/format";

export function Paginacao({
  pagina,
  totalPaginas,
  onMudar,
  total,
  porPagina,
}: {
  pagina: number;
  totalPaginas: number;
  onMudar: (p: number) => void;
  total?: number;
  porPagina?: number;
}) {
  const mostrando =
    total !== undefined && porPagina !== undefined
      ? total === 0
        ? "Nenhum resultado"
        : `Mostrando ${inteiro((pagina - 1) * porPagina + 1)}–${inteiro(Math.min(pagina * porPagina, total))} de ${inteiro(total)}`
      : null;

  if (totalPaginas <= 1 && !mostrando) return null;

  return (
    <nav className="paginacao" aria-label="Paginação">
      <span className="paginacao-info">{mostrando ?? `Página ${pagina} de ${totalPaginas}`}</span>
      <span className="paginacao-botoes">
        <button type="button" className="btn" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}>
          Anterior
        </button>
        <button
          type="button"
          className="btn"
          disabled={pagina >= totalPaginas}
          onClick={() => onMudar(pagina + 1)}
        >
          Próxima
        </button>
      </span>
    </nav>
  );
}
