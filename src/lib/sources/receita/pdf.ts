import { spawn } from "node:child_process";

// Usa o binário `pdftotext` (poppler-utils), sem dependência npm. `-layout` preserva as colunas.
export function pdfParaTexto(pdf: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pdftotext", ["-layout", "-", "-"]);
    const saida: Buffer[] = [];
    const erro: Buffer[] = [];
    proc.stdout.on("data", (b: Buffer) => saida.push(b));
    proc.stderr.on("data", (b: Buffer) => erro.push(b));
    proc.on("error", (e: NodeJS.ErrnoException) =>
      reject(
        e.code === "ENOENT"
          ? new Error("pdftotext não encontrado: instale o poppler-utils (apt-get install poppler-utils)")
          : e,
      ),
    );
    proc.on("close", (codigo) =>
      codigo === 0
        ? resolve(Buffer.concat(saida).toString("utf8"))
        : reject(new Error(`pdftotext saiu com código ${codigo}: ${Buffer.concat(erro).toString("utf8")}`)),
    );
    proc.stdin.on("error", () => {}); // EPIPE se o processo morrer antes de ler tudo
    proc.stdin.end(Buffer.from(pdf));
  });
}
