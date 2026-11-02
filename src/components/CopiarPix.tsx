"use client";

import { useEffect, useRef, useState } from "react";

type Estado = "parado" | "copiado" | "erro";

// Campo com o código "Pix copia e cola" e o botão de copiar. Se o navegador bloquear a área de transferência, tenta o método antigo.
export function CopiarPix({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<Estado>("parado");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copiar() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = texto;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, texto.length); // o iPhone só copia com a faixa selecionada assim
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    setEstado(ok ? "copiado" : "erro");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado("parado"), 3000);
  }

  return (
    <>
      <label className="apoie-codigo">
        Pix copia e cola
        <textarea readOnly rows={5} value={texto} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="apoie-acoes">
        <button type="button" className="botao-pix" onClick={copiar}>
          {estado === "copiado" ? "Copiado!" : "Copiar Pix copia e cola"}
        </button>
        <span className="botao-pix-aviso" role="status" aria-live="polite">
          {estado === "copiado" && "Código copiado. Cole no aplicativo do seu banco."}
          {estado === "erro" && "Não consegui copiar sozinho: selecione o código acima e copie."}
        </span>
      </div>
    </>
  );
}
