"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import { Paginacao } from "@/components/Paginacao";
import { brlCompacto, brlInteiro, inteiro, rotuloCategoria } from "@/lib/format";
import type { CasaLegislativa } from "@/lib/leis";
import { paginar } from "@/lib/paginacao";
import { filtrarOrdenar, resumir, type Filtros, type LinhaRanking } from "@/lib/ranking";

const POR_PAGINA = 25;
const INICIAL: Filtros = { busca: "", uf: "", partido: "", situacao: "ativos", ordem: "gasto-desc" };

export function ListaParlamentares({
  linhas,
  ano,
  periodo,
  nominais,
  casa,
}: {
  linhas: LinhaRanking[];
  ano: number;
  periodo: string;
  nominais: number;
  casa: CasaLegislativa;
}) {
  const plural = casa === "SENADO" ? "senadores" : "deputados";
  const singular = casa === "SENADO" ? "senador" : "deputado";
  const [filtros, setFiltros] = useState<Filtros>(INICIAL);
  const [pagina, setPagina] = useState(1);

  const ufs = useMemo(() => [...new Set(linhas.map((l) => l.uf))].sort(), [linhas]);
  const partidos = useMemo(() => [...new Set(linhas.map((l) => l.partido))].sort(), [linhas]);

  const filtradas = useMemo(() => filtrarOrdenar(linhas, filtros), [linhas, filtros]);
  const resumo = useMemo(() => resumir(filtradas), [filtradas]);
  const notas = useMemo(() => filtradas.reduce((s, l) => s + l.notas, 0), [filtradas]);
  const pag = paginar(filtradas, pagina, POR_PAGINA);
  const maximo = Math.max(0, ...filtradas.map((l) => l.gasto));

  function mudar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Gasto total com a cota" valor={brlCompacto(resumo.total)} nota={`${plural}, ${periodo}`} />
        <Kpi rotulo={`Média por ${singular}`} valor={brlInteiro(resumo.media)} nota="no ano" />
        <Kpi rotulo="Notas fiscais" valor={inteiro(notas)} nota="documentos da cota no ano" />
      </div>

      <div className="card tabela-card">
        <div className="filtros filtros-tabela">
          <label>
            Buscar
            <input
              type="search"
              placeholder="Nome do parlamentar"
              value={filtros.busca}
              onChange={(e) => mudar("busca", e.target.value)}
            />
          </label>
          <label>
            UF
            <select value={filtros.uf} onChange={(e) => mudar("uf", e.target.value)}>
              <option value="">Todas</option>
              {ufs.map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label>
            Partido
            <select value={filtros.partido} onChange={(e) => mudar("partido", e.target.value)}>
              <option value="">Todos</option>
              {partidos.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Situação
            <select
              value={filtros.situacao}
              onChange={(e) => mudar("situacao", e.target.value as Filtros["situacao"])}
            >
              <option value="ativos">Em exercício</option>
              <option value="todos">Todos da legislatura</option>
            </select>
          </label>
          <label>
            Ordenar por
            <select
              value={filtros.ordem}
              onChange={(e) => mudar("ordem", e.target.value as Filtros["ordem"])}
            >
              <option value="gasto-desc">Maior gasto</option>
              <option value="gasto-asc">Menor gasto</option>
              <option value="nome">Nome</option>
            </select>
          </label>
        </div>

        <div className="tabela-wrap">
          <table className="tabela tabela-ranking">
            <thead>
              <tr>
                <th>#</th>
                <th>Parlamentar</th>
                <th className="num">Gasto em {ano}</th>
                <th>Maior categoria</th>
                <th className="num">Presença</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {pag.itens.map((l, i) => (
                <tr key={l.id}>
                  <td className="col-rank">{(pag.pagina - 1) * POR_PAGINA + i + 1}</td>
                  <td>
                    <div className="celula-nome">
                      <Avatar nome={l.nome} fotoUrl={l.fotoUrl} tamanho={36} />
                      <span>
                        <strong className="nome-parl">{l.nome}</strong>
                        <span className="sub">
                          {l.partido} · {l.uf}
                          {!l.ativo && <span className="selo">Fora de exercício</span>}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="col-gasto">
                    <span className="gasto-valor">{brlInteiro(l.gasto)}</span>
                    <Barra valor={l.gasto} maximo={maximo} />
                  </td>
                  <td className="col-categoria">
                    {l.maiorCategoria ? rotuloCategoria(l.maiorCategoria) : "—"}
                  </td>
                  <td className="num">
                    {nominais ? `${Math.round((l.votou / nominais) * 100)}%` : "—"}
                  </td>
                  <td className="col-acao">
                    <Link href={`/parlamentares/${l.id}`} className="btn btn-link">
                      Ver perfil
                    </Link>
                  </td>
                </tr>
              ))}
              {pag.itens.length === 0 && (
                <tr><td colSpan={6} className="vazio">Nenhum parlamentar encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacao
          pagina={pag.pagina}
          totalPaginas={pag.totalPaginas}
          onMudar={setPagina}
          total={filtradas.length}
          porPagina={POR_PAGINA}
        />
      </div>
    </>
  );
}
