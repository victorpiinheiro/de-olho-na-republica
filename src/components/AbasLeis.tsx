"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ABAS, type Aba } from "@/lib/leis";

// Uma linha só, com rolagem para o lado: com 8 abas, quebrar em várias linhas ocupava boa parte da tela (no celular,
// 3 linhas). A aba ativa é centralizada ao abrir, senão uma das últimas ficaria escondida fora da tela.
export function AbasLeis({ ativa }: { ativa: Aba }) {
  const faixa = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = faixa.current;
    const atual = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !atual) return;
    // Mexe só na rolagem da própria faixa (scrollIntoView poderia rolar a página também).
    el.scrollLeft = atual.offsetLeft - (el.clientWidth - atual.offsetWidth) / 2;
  }, [ativa]);

  return (
    <nav className="abas" aria-label="Filtro de leis" ref={faixa}>
      {ABAS.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          className="aba"
          aria-current={a.chave === ativa ? "page" : undefined}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
