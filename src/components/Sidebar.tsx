"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeGrafico, IconeImpostometro, IconeInstituicao, IconeLivro, IconeOrcamento, IconePessoas } from "@/components/icones";

const itens = [
  { href: "/impostometro", rotulo: "Impostômetro", Icone: IconeImpostometro },
  { href: "/parlamentares", rotulo: "Parlamentares", Icone: IconePessoas },
  { href: "/leis", rotulo: "Leis e votações", Icone: IconeInstituicao },
  { href: "/orcamento", rotulo: "Orçamento", Icone: IconeOrcamento },
  { href: "/eleicoes", rotulo: "Eleições 2026", Icone: IconeGrafico },
  { href: "/historia", rotulo: "História do país", Icone: IconeLivro },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-marca" aria-hidden="true">O</span>
        <span>
          <strong>De Olho na República</strong>
          <small>Dados públicos e automáticos</small>
        </span>
      </Link>

      <nav className="nav" aria-label="Seções">
        <p className="nav-titulo">SEÇÕES</p>
        {itens.map(({ href, rotulo, Icone }) => (
          <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
            <Icone />
            {rotulo}
          </Link>
        ))}
      </nav>

      <div className="sidebar-rodape">
        <p className="nav-titulo">FONTES</p>
        <p>Câmara dos Deputados · Senado Federal</p>
      </div>
    </aside>
  );
}
