"use client";

import Image from "next/image";
import { useState } from "react";

// Foto do presidente (Wikimedia Commons). Se faltar ou não carregar, mostra as iniciais.
export function FotoPresidente({
  url,
  iniciais,
  alt,
  tamanho,
}: {
  url: string | null;
  iniciais: string;
  alt: string; // "" na miniatura da lista (o nome já está ao lado)
  tamanho: "mini" | "grande";
}) {
  const [quebrou, setQuebrou] = useState(false);
  const sizes = tamanho === "grande" ? "112px" : "40px";
  return (
    <span className={`foto-pres foto-pres-${tamanho}`}>
      {url && !quebrou ? (
        <Image src={url} alt={alt} fill sizes={sizes} onError={() => setQuebrou(true)} />
      ) : (
        <span className="foto-pres-iniciais" aria-hidden={alt === ""}>{iniciais}</span>
      )}
    </span>
  );
}
