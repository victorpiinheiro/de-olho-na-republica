"use client";

import { useRef, useState } from "react";
import { CardLei } from "@/components/CardLei";
import { BUSCA_MIN } from "@/lib/leis-api";
import type { Aba } from "@/lib/leis";
import type { CardLei as Card, PaginaLeis } from "@/lib/queries/leis";

const ATRASO_BUSCA_MS = 350; // espera o usuário parar de digitar antes de ir ao servidor

interface Dados {
  cards: Card[];
  total: number;
  paginas: number; // quantas páginas de 100 já estão na tela (a próxima a pedir é esta)
  ano: number | null; // ano e busca a que estes cards pertencem: o cabeçalho descreve o que está na tela,
  q: string; // não o que acabou de ser digitado ou escolhido
}

type Estado = "parado" | "carregando" | "erro";

// A primeira página de cada aba vem pronta do servidor. A busca, o filtro por ano e o "Carregar mais" vão a /api/leis
// e procuram no banco INTEIRO (todas as páginas, não só o que já está na tela).
export function ListaFiltravelLeis({ aba, inicial }: { aba: Aba; inicial: PaginaLeis }) {
  const [busca, setBusca] = useState(""); // o que está digitado
  const [escolhido, setEscolhido] = useState<number | null>(null); // valor do seletor de ano
  const [dados, setDados] = useState<Dados>({ cards: inicial.cards, total: inicial.total, paginas: 1, ano: null, q: "" });
  const [estado, setEstado] = useState<Estado>("parado");
  const [substituindo, setSubstituindo] = useState(false); // há uma busca ou troca de ano a caminho
  const pedido = useRef(0); // ignora respostas de pedidos antigos (ex.: digitou outra coisa enquanto carregava)
  const atraso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const substantivo = aba === "viraram-lei" ? ["lei", "leis"] : ["proposição", "proposições"];

  // undefined = resposta obsoleta (já há um pedido mais novo: não mexe em nada); null = erro; objeto = deu certo.
  async function buscarNoServidor(pagina: number, ano: number | null, q: string): Promise<{ cards: Card[]; total: number } | null | undefined> {
    const meu = ++pedido.current;
    setEstado("carregando");
    try {
      const params = new URLSearchParams({ aba, pagina: String(pagina) });
      if (ano) params.set("ano", String(ano));
      if (q) params.set("q", q);
      const res = await fetch(`/api/leis?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { cards: Card[]; total: number };
      if (meu !== pedido.current) return undefined;
      setEstado("parado");
      return json;
    } catch {
      if (meu !== pedido.current) return undefined;
      setEstado("erro");
      return null;
    }
  }

  // Mostra a lista para este ano e este texto (sem texto e sem ano, volta à página inicial, que já está pronta).
  async function aplicar(ano: number | null, texto: string) {
    const q = texto.trim().length >= BUSCA_MIN ? texto.trim().replace(/\s+/g, " ") : "";
    if (ano === null && q === "") {
      pedido.current++; // cancela qualquer pedido em andamento
      setDados({ cards: inicial.cards, total: inicial.total, paginas: 1, ano: null, q: "" });
      setSubstituindo(false);
      setEstado("parado");
      return;
    }
    setSubstituindo(true);
    const r = await buscarNoServidor(0, ano, q);
    if (r === undefined) return; // chegou outro pedido depois deste
    setSubstituindo(false);
    if (r) setDados({ ...r, paginas: 1, ano, q });
    else setEscolhido(dados.ano); // erro: o seletor volta ao ano dos cards que continuam na tela
  }

  function digitar(valor: string) {
    setBusca(valor);
    if (atraso.current) clearTimeout(atraso.current);
    atraso.current = setTimeout(() => aplicar(escolhido, valor), ATRASO_BUSCA_MS);
  }

  function buscarAgora() {
    if (atraso.current) clearTimeout(atraso.current);
    aplicar(escolhido, busca);
  }

  function mudarAno(novo: number | null) {
    setEscolhido(novo);
    if (atraso.current) clearTimeout(atraso.current);
    aplicar(novo, busca);
  }

  async function carregarMais() {
    const r = await buscarNoServidor(dados.paginas, dados.ano, dados.q);
    if (!r) return; // obsoleto ou erro (o erro já aparece na tela)
    setDados((atual) => {
      const ja = new Set(atual.cards.map((c) => c.id));
      return {
        ...atual,
        cards: [...atual.cards, ...r.cards.filter((c) => !ja.has(c.id))],
        total: r.total || atual.total,
        paginas: atual.paginas + 1,
      };
    });
  }

  const restantes = dados.total - dados.cards.length;
  const nome = dados.total === 1 ? substantivo[0] : substantivo[1];
  const filtroAno = dados.ano ? ` em ${dados.ano}` : "";
  const cabecalho = substituindo
    ? "Buscando…"
    : dados.q
      ? `${dados.total} ${nome} para “${dados.q}”${filtroAno}${restantes > 0 ? ` (mostrando ${dados.cards.length})` : ""}`
      : `Mostrando ${dados.cards.length} de ${dados.total} ${nome}${filtroAno}`;

  return (
    <>
      <div className="filtros filtros-leis">
        <label>
          Buscar
          <input
            type="search"
            placeholder="Código, número da lei, tema ou autor (ex.: PL 2418/2026)"
            value={busca}
            onChange={(e) => digitar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscarAgora()}
          />
        </label>
        <label>
          Ano da votação
          <select value={escolhido ?? ""} onChange={(e) => mudarAno(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Todos os anos</option>
            {inicial.anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      {busca.trim().length > 0 && busca.trim().length < BUSCA_MIN && (
        <p className="dica-busca">Digite pelo menos {BUSCA_MIN} letras ou números para buscar.</p>
      )}

      <div className="lista-leis-cabecalho">
        <span role="status" aria-live="polite">{cabecalho}</span>
        <ul className="placar-legenda">
          <li><i className="chip chip-sim" /> Sim</li>
          <li><i className="chip chip-nao" /> Não</li>
          <li><i className="chip chip-abst" /> Abstenção</li>
        </ul>
      </div>

      <div className="lista-leis" aria-busy={substituindo}>
        {dados.cards.map((l) => (
          <CardLei key={l.id} lei={l} />
        ))}
        {dados.cards.length === 0 && !substituindo && (
          <div className="card vazio">
            Nenhuma {substantivo[0]} encontrada{dados.q ? ` para “${dados.q}”` : ""}.
            {dados.q && " A busca procura no código, na norma, na ementa e nos autores, com o texto oficial: tente outras palavras."}
          </div>
        )}
      </div>

      {restantes > 0 && (
        <div className="mais-leis">
          <button type="button" className="botao-secundario" onClick={carregarMais} disabled={estado === "carregando"}>
            {estado === "carregando" && !substituindo ? "Carregando…" : `Carregar mais (restam ${restantes})`}
          </button>
          {estado === "erro" && <span className="mais-leis-erro" role="alert">Não consegui carregar agora. Tente de novo.</span>}
        </div>
      )}
      {restantes <= 0 && estado === "erro" && (
        <p className="mais-leis-erro" role="alert">Não consegui carregar agora. Tente de novo.</p>
      )}
    </>
  );
}
