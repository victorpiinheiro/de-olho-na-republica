"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CardLei } from "@/components/CardLei";
import { BUSCA_MIN } from "@/lib/leis-api";
import type { Aba } from "@/lib/leis";
import type { AutorDeLei, CardLei as Card, PaginaLeis } from "@/lib/queries/leis";

const ATRASO_BUSCA_MS = 350; // espera o usuário parar de digitar antes de ir ao servidor

// Texto que aparece na lista de sugestões (e que o campo guarda ao escolher). Partido, UF e casa distinguem homônimos.
const rotuloDoAutor = (a: AutorDeLei) => `${a.nome} (${a.partido}-${a.uf}, ${a.casa === "CAMARA" ? "Câmara" : "Senado"})`;

interface Dados {
  cards: Card[];
  total: number;
  paginas: number; // quantas páginas de 100 já estão na tela (a próxima a pedir é esta)
  ano: number | null; // ano e busca a que estes cards pertencem: o cabeçalho descreve o que está na tela,
  q: string; // não o que acabou de ser digitado ou escolhido
  autor: AutorDeLei | null;
}

type Estado = "parado" | "carregando" | "erro";

// Lê o ?autor= do endereço. Fica num componente à parte, dentro de um Suspense, porque useSearchParams tira da página
// estática o que está dentro do Suspense: assim só este (que não desenha nada) sai, e a lista continua no HTML pronto.
// Usa useSearchParams (e não window.location) porque, vindo do perfil por um link do Next, o endereço da janela ainda
// é o da página anterior quando o componente monta.
function AutorDaUrl({ aoMudar }: { aoMudar: (id: number) => void }) {
  const texto = useSearchParams().get("autor");
  useEffect(() => {
    const id = Number(texto);
    if (texto && Number.isInteger(id) && id >= 1) aoMudar(id);
    // só quando o endereço muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  return null;
}

// A primeira página de cada aba vem pronta do servidor. A busca, o filtro por ano e o "Carregar mais" vão a /api/leis
// e procuram no banco INTEIRO (todas as páginas, não só o que já está na tela).
export function ListaFiltravelLeis({ aba, inicial }: { aba: Aba; inicial: PaginaLeis }) {
  const [busca, setBusca] = useState(""); // o que está digitado
  const [escolhido, setEscolhido] = useState<number | null>(null); // valor do seletor de ano
  const [autorTexto, setAutorTexto] = useState(""); // o que está no campo "Autor"
  const [autorEscolhido, setAutorEscolhido] = useState<AutorDeLei | null>(null);
  const [autores, setAutores] = useState<AutorDeLei[] | null>(null); // lista de sugestões, carregada na primeira vez que o campo recebe foco
  const [dados, setDados] = useState<Dados>({ cards: inicial.cards, total: inicial.total, paginas: 1, ano: null, q: "", autor: null });
  const [estado, setEstado] = useState<Estado>("parado");
  const [substituindo, setSubstituindo] = useState(false); // há uma busca ou troca de ano a caminho
  const pedido = useRef(0); // ignora respostas de pedidos antigos (ex.: digitou outra coisa enquanto carregava)
  const atraso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const substantivo = aba === "viraram-lei" ? ["lei", "leis"] : ["proposição", "proposições"];

  // undefined = resposta obsoleta (já há um pedido mais novo: não mexe em nada); null = erro; objeto = deu certo.
  async function buscarNoServidor(pagina: number, ano: number | null, q: string, autor: AutorDeLei | null): Promise<{ cards: Card[]; total: number } | null | undefined> {
    const meu = ++pedido.current;
    setEstado("carregando");
    try {
      const params = new URLSearchParams({ aba, pagina: String(pagina) });
      if (ano) params.set("ano", String(ano));
      if (q) params.set("q", q);
      if (autor) params.set("autor", String(autor.id));
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

  // Mostra a lista para este ano, este texto e este autor (sem nenhum dos três, volta à página inicial, que já está pronta).
  async function aplicar(ano: number | null, texto: string, autor: AutorDeLei | null) {
    const q = texto.trim().length >= BUSCA_MIN ? texto.trim().replace(/\s+/g, " ") : "";
    if (ano === null && q === "" && autor === null) {
      pedido.current++; // cancela qualquer pedido em andamento
      setDados({ cards: inicial.cards, total: inicial.total, paginas: 1, ano: null, q: "", autor: null });
      setSubstituindo(false);
      setEstado("parado");
      return;
    }
    setSubstituindo(true);
    const r = await buscarNoServidor(0, ano, q, autor);
    if (r === undefined) return; // chegou outro pedido depois deste
    setSubstituindo(false);
    if (r) setDados({ ...r, paginas: 1, ano, q, autor });
    else {
      // erro: os seletores voltam ao que os cards que continuam na tela mostram
      setEscolhido(dados.ano);
      setAutorEscolhido(dados.autor);
      setAutorTexto(dados.autor ? rotuloDoAutor(dados.autor) : "");
    }
  }

  function digitar(valor: string) {
    setBusca(valor);
    if (atraso.current) clearTimeout(atraso.current);
    atraso.current = setTimeout(() => aplicar(escolhido, valor, autorEscolhido), ATRASO_BUSCA_MS);
  }

  function buscarAgora() {
    if (atraso.current) clearTimeout(atraso.current);
    aplicar(escolhido, busca, autorEscolhido);
  }

  function mudarAno(novo: number | null) {
    setEscolhido(novo);
    if (atraso.current) clearTimeout(atraso.current);
    aplicar(novo, busca, autorEscolhido);
  }

  // Carrega a lista de autores uma vez, na primeira vez que o campo recebe foco (a maioria dos visitantes nunca usa).
  async function carregarAutores(): Promise<AutorDeLei[] | null> {
    if (autores !== null) return autores;
    try {
      const res = await fetch("/api/leis/autores");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = ((await res.json()) as { autores: AutorDeLei[] }).autores;
      setAutores(lista);
      return lista;
    } catch {
      return null; // tenta de novo no próximo foco
    }
  }

  // Vindo do perfil de um parlamentar (/leis?autor=123): mostra a lista já filtrada por ele. O id que não está na lista
  // (inválido, ou de quem não tem autoria votada) é ignorado, e a tela fica normal.
  async function escolherAutorPeloId(id: number) {
    const lista = await carregarAutores();
    const achado = lista?.find((a) => a.id === id);
    if (!achado) return;
    setAutorEscolhido(achado);
    setAutorTexto(rotuloDoAutor(achado));
    await aplicar(null, "", achado);
  }

  // O campo aceita só uma escolha da lista: digitar um pedaço do nome apenas filtra as sugestões.
  function digitarAutor(valor: string) {
    setAutorTexto(valor);
    const achado = valor === "" ? null : (autores?.find((a) => rotuloDoAutor(a) === valor) ?? null);
    if (valor !== "" && !achado) return; // ainda digitando
    if (achado?.id === autorEscolhido?.id) return;
    setAutorEscolhido(achado);
    if (atraso.current) clearTimeout(atraso.current);
    aplicar(escolhido, busca, achado);
  }

  async function carregarMais() {
    const r = await buscarNoServidor(dados.paginas, dados.ano, dados.q, dados.autor);
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
  const filtroAno = (dados.ano ? ` em ${dados.ano}` : "") + (dados.autor ? ` de autoria de ${dados.autor.nome}` : "");
  const cabecalho = substituindo
    ? "Buscando…"
    : dados.q
      ? `${dados.total} ${nome} para “${dados.q}”${filtroAno}${restantes > 0 ? ` (mostrando ${dados.cards.length})` : ""}`
      : `Mostrando ${dados.cards.length} de ${dados.total} ${nome}${filtroAno}`;

  return (
    <>
      <Suspense fallback={null}>
        <AutorDaUrl aoMudar={escolherAutorPeloId} />
      </Suspense>
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
          Autor (parlamentar)
          <input
            type="search"
            list="autores-leis"
            placeholder="Escolha um parlamentar"
            value={autorTexto}
            onFocus={() => void carregarAutores()}
            onChange={(e) => digitarAutor(e.target.value)}
            autoComplete="off"
          />
          <datalist id="autores-leis">
            {(autores ?? []).map((a) => (
              <option key={a.id} value={rotuloDoAutor(a)} />
            ))}
          </datalist>
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
