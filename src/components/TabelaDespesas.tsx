"use client";

import { useMemo, useState } from "react";
import { IconeNota } from "@/components/icones";
import { Paginacao } from "@/components/Paginacao";
import { paraCsv } from "@/lib/csv";
import { brl, documentoFornecedor, MESES, rotuloCategoria } from "@/lib/format";
import { paginar } from "@/lib/paginacao";

export interface DespesaLinha {
  id: number;
  tipo: string;
  fornecedor: string;
  cnpjCpf: string | null;
  valor: number;
  data: string | null;
  urlDocumento: string | null;
}

const POR_PAGINA = 20;

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export function TabelaDespesas({
  despesas,
  ano,
  arquivo,
  fonte,
}: {
  despesas: DespesaLinha[];
  ano: number;
  arquivo: string;
  fonte: string;
}) {
  // O Senado não expõe o link da nota nos dados abertos: sem link em nenhuma linha, sem coluna.
  const comLinkNota = despesas.some((d) => d.urlDocumento);
  const [pagina, setPagina] = useState(1);
  const [categoria, setCategoria] = useState("");
  const [mes, setMes] = useState("");

  const categorias = useMemo(() => [...new Set(despesas.map((d) => d.tipo))].sort(), [despesas]);
  const meses = useMemo(
    () => [...new Set(despesas.flatMap((d) => (d.data ? [Number(d.data.slice(5, 7))] : [])))].sort((a, b) => a - b),
    [despesas],
  );

  const filtradas = useMemo(
    () =>
      despesas.filter(
        (d) => (!categoria || d.tipo === categoria) && (!mes || d.data?.slice(5, 7) === mes.padStart(2, "0")),
      ),
    [despesas, categoria, mes],
  );
  const pag = paginar(filtradas, pagina, POR_PAGINA);

  function exportar() {
    const csv = paraCsv(
      ["Data", "Fornecedor", "CNPJ/CPF", "Categoria", "Valor (R$)", "Link da nota"],
      filtradas.map((d) => [dataBr(d.data), d.fornecedor, documentoFornecedor(d.cnpjCpf), rotuloCategoria(d.tipo), d.valor.toFixed(2).replace(".", ","), d.urlDocumento]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${arquivo}-${ano}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="despesas-topo">
        <div>
          <h2>Despesas e notas fiscais</h2>
          <p className="lead">
            Cada linha é um documento da cota parlamentar{comLinkNota ? ", com link para a imagem da nota" : ""}.
          </p>
        </div>
        <div className="filtros filtros-despesas">
          <label>
            Categoria
            <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(1); }}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c} value={c}>{rotuloCategoria(c)}</option>)}
            </select>
          </label>
          <label>
            Mês
            <select value={mes} onChange={(e) => { setMes(e.target.value); setPagina(1); }}>
              <option value="">Todos</option>
              {meses.map((m) => <option key={m} value={m}>{MESES[m - 1]} {ano}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={exportar} disabled={filtradas.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="tabela-wrap">
        <table className="tabela tabela-ranking">
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornecedor</th>
              <th>Categoria</th>
              <th className="num">Valor</th>
              {comLinkNota && <th>Nota</th>}
            </tr>
          </thead>
          <tbody>
            {pag.itens.map((d) => (
              <tr key={d.id}>
                <td>{dataBr(d.data)}</td>
                <td>
                  <strong className="nome-parl">{d.fornecedor}</strong>
                  {documentoFornecedor(d.cnpjCpf) && (
                    <span className="sub">CNPJ/CPF {d.cnpjCpf}</span>
                  )}
                </td>
                <td>{rotuloCategoria(d.tipo)}</td>
                <td className="num">{brl(d.valor)}</td>
                {comLinkNota && (
                  <td>
                    {d.urlDocumento ? (
                      <a href={d.urlDocumento} target="_blank" rel="noopener noreferrer" className="link-nota">
                        <IconeNota /> Ver nota
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
              </tr>
            ))}
            {pag.itens.length === 0 && (
              <tr><td colSpan={comLinkNota ? 5 : 4} className="vazio">Sem despesas para este filtro.</td></tr>
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
      <p className="nota-rodape">
        {comLinkNota ? "Imagens das notas fornecidas pela " : "Dados da "}
        {fonte}. Lançamentos duplicados na origem são removidos automaticamente.
        {!comLinkNota && " O link do documento não é publicado nos dados abertos."}
      </p>
    </>
  );
}
