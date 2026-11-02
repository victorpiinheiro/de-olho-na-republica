"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconeFechar,
  IconeGrafico,
  IconeImpostometro,
  IconeInstituicao,
  IconeLivro,
  IconeMenu,
  IconeOrcamento,
  IconePessoas,
} from "@/components/icones";

const itens = [
  { href: "/impostometro", rotulo: "Impostômetro", Icone: IconeImpostometro },
  { href: "/parlamentares", rotulo: "Parlamentares", Icone: IconePessoas },
  { href: "/leis", rotulo: "Leis e votações", Icone: IconeInstituicao },
  { href: "/orcamento", rotulo: "Orçamento", Icone: IconeOrcamento },
  { href: "/eleicoes", rotulo: "Eleições 2026", Icone: IconeGrafico },
  { href: "/historia", rotulo: "História do país", Icone: IconeLivro },
];

// Telas largas: menu fixo à esquerda. Celular (até 800 px): barra no topo com o botão de hambúrguer e o menu como
// gaveta lateral. A gaveta fecha ao navegar (inclusive pelo botão "voltar"), com Esc, no fundo escurecido e no X.
export function Sidebar({ mostrarApoie = false }: { mostrarApoie?: boolean }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  // Ao mudar de página (link, "voltar" ou "avançar") a gaveta fecha. É o padrão do React para ajustar estado
  // quando uma propriedade muda, sem efeito: o estado é zerado durante a renderização.
  const [paginaAnterior, setPaginaAnterior] = useState(pathname);
  if (paginaAnterior !== pathname) {
    setPaginaAnterior(pathname);
    setAberto(false);
  }
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);

  const fechar = (devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) botaoRef.current?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    document.body.classList.add("menu-aberto"); // trava a rolagem da página (só vale no celular, ver CSS)
    menuRef.current?.querySelector<HTMLElement>("nav a")?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      // O foco circula entre o botão do menu (o "X") e a gaveta, sem ir para a página atrás.
      const itens = menuRef.current?.querySelectorAll<HTMLElement>("a[href]");
      const alvos = [botaoRef.current, ...(itens ?? [])].filter((x): x is HTMLElement => x !== null);
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.classList.remove("menu-aberto");
    };
  }, [aberto]);

  return (
    <>
      <header className={`topo-mobile${aberto ? " topo-mobile-aberto" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-marca" aria-hidden="true">O</span>
          <strong>De Olho na República</strong>
        </Link>
        <button
          ref={botaoRef}
          type="button"
          className="menu-botao"
          aria-expanded={aberto}
          aria-controls="menu-lateral"
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          onClick={() => setAberto(!aberto)}
        >
          {aberto ? <IconeFechar /> : <IconeMenu />}
        </button>
      </header>

      {/* Botão (e não div): no Safari do iPhone, tocar numa div sem ação não gera clique. */}
      {aberto && <button type="button" className="menu-fundo" aria-label="Fechar menu" tabIndex={-1} onClick={() => fechar(true)} />}

      <aside id="menu-lateral" ref={menuRef} className={`sidebar${aberto ? " sidebar-aberta" : ""}`}>
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
          {mostrarApoie && (
            <Link href="/apoie" className="apoie-link" aria-current={pathname.startsWith("/apoie") ? "page" : undefined}>
              Apoie o projeto
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
