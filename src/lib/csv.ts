// CSV para abrir direto no Excel em pt-BR: separador ";", BOM e campos entre aspas.
const campo = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function paraCsv(cabecalho: string[], linhas: (string | number | null)[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n");
}
