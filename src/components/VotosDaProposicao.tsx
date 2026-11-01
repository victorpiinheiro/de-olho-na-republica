"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Placar } from "@/components/Placar";
import { dataBr, inteiro } from "@/lib/format";
import { rotuloResultado, type CasaLegislativa } from "@/lib/leis";
import type { VotacaoDetalhe } from "@/lib/queries/leis";

const ROTULO_VOTO: Record<string, string> = {
  SIM: "Sim",
  NAO: "Não",
  ABSTENCAO: "Abstenção",
  PRESIDENTE: "Presidente da sessão",
  PRESENTE_SEM_VOTO: "Presente, sem voto",
  AUSENTE: "Ausente",
};
const CLASSE_VOTO: Record<string, string> = {
  SIM: "voto-sim",
  NAO: "voto-nao",
  ABSTENCAO: "voto-abst",
};
const ROTULO_ESTADO = { nominal: "nominal", simbolica: "simbólica", secreta: "secreta" } as const;

const resumo = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export function VotosDaProposicao({
  votacoes,
  indiceInicial,
  casa,
}: {
  votacoes: VotacaoDetalhe[];
  indiceInicial: number;
  casa: CasaLegislativa;
}) {
  const parlamentar = casa === "SENADO" ? "senador" : "deputado";
  const [indice, setIndice] = useState(indiceInicial);
  const [filtroVoto, setFiltroVoto] = useState("");
  const [filtroPartido, setFiltroPartido] = useState("");
  const [filtroUf, setFiltroUf] = useState("");
  const [busca, setBusca] = useState("");

  const v = votacoes[indice];

  const porPartido = useMemo(() => {
    const mapa = new Map<string, { sim: number; nao: number; abst: number; outros: number }>();
    for (const x of v?.votos ?? []) {
      const l = mapa.get(x.partido) ?? { sim: 0, nao: 0, abst: 0, outros: 0 };
      if (x.voto === "SIM") l.sim++;
      else if (x.voto === "NAO") l.nao++;
      else if (x.voto === "ABSTENCAO") l.abst++;
      else l.outros++;
      mapa.set(x.partido, l);
    }
    const orient = new Map((v?.orientacoes ?? []).map((o) => [o.partido, o.orientacao]));
    return [...mapa]
      .map(([partido, c]) => ({ partido, ...c, orientacao: orient.get(partido) ?? null }))
      .sort((a, b) => b.sim + b.nao + b.abst + b.outros - (a.sim + a.nao + a.abst + a.outros));
  }, [v]);

  const partidos = useMemo(() => [...new Set((v?.votos ?? []).map((x) => x.partido))].sort(), [v]);
  const ufs = useMemo(() => [...new Set((v?.votos ?? []).map((x) => x.uf))].sort(), [v]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return (v?.votos ?? []).filter(
      (x) =>
        (!filtroVoto || x.voto === filtroVoto) &&
        (!filtroPartido || x.partido === filtroPartido) &&
        (!filtroUf || x.uf === filtroUf) &&
        (!termo || x.nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(termo)),
    );
  }, [v, filtroVoto, filtroPartido, filtroUf, busca]);

  function trocar(i: number) {
    setIndice(i);
    setFiltroVoto("");
    setFiltroPartido("");
    setFiltroUf("");
    setBusca("");
  }

  if (!v) return <p className="vazio">Nenhuma votação registrada no plenário.</p>;

  return (
    <div className="votos-prop">
      <label className="seletor-votacao">
        Votação
        <select value={indice} onChange={(e) => trocar(Number(e.target.value))}>
          {votacoes.map((x, i) => (
            <option key={x.id} value={i}>
              {dataBr(x.dataIso)} · {ROTULO_ESTADO[x.estado]} · {resumo(x.descricao)}
            </option>
          ))}
        </select>
      </label>

      <div className="votacao-resumo">
        <p>
          <strong>{rotuloResultado(v.aprovada)}</strong> em {dataBr(v.dataIso)} — {v.descricao}
        </p>
        <Placar estado={v.estado} sim={v.sim} nao={v.nao} abst={v.abst} />
      </div>

      {v.orientacoes.length > 0 && (
        <section>
          <h3>Orientação das lideranças</h3>
          <ul className="orientacoes">
            {v.orientacoes.map((o) => (
              <li key={o.partido}>
                <span>{o.partido}</span> <strong>{o.orientacao}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.estado === "nominal" && (
        <>
          <section>
            <h3>Voto por partido</h3>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Partido</th>
                    <th className="num">Sim</th>
                    <th className="num">Não</th>
                    <th className="num">Abst.</th>
                    <th className="num">Outros</th>
                    <th>Orientação</th>
                  </tr>
                </thead>
                <tbody>
                  {porPartido.map((p) => (
                    <tr key={p.partido}>
                      <td>{p.partido}</td>
                      <td className="num">{inteiro(p.sim)}</td>
                      <td className="num">{inteiro(p.nao)}</td>
                      <td className="num">{inteiro(p.abst)}</td>
                      <td className="num">{inteiro(p.outros)}</td>
                      <td>{p.orientacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3>Como cada {parlamentar} votou</h3>
            <div className="filtros filtros-votos">
              <label>
                Buscar
                <input type="search" placeholder="Nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              <label>
                Voto
                <select value={filtroVoto} onChange={(e) => setFiltroVoto(e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(ROTULO_VOTO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                </select>
              </label>
              <label>
                Partido
                <select value={filtroPartido} onChange={(e) => setFiltroPartido(e.target.value)}>
                  <option value="">Todos</option>
                  {partidos.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label>
                UF
                <select value={filtroUf} onChange={(e) => setFiltroUf(e.target.value)}>
                  <option value="">Todas</option>
                  {ufs.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <p className="lead">{inteiro(filtrados.length)} de {inteiro(v.votos.length)} {parlamentar}es</p>
            <ul className="grade-votos">
              {filtrados.map((x) => (
                <li key={x.parlamentarId} className={CLASSE_VOTO[x.voto] ?? "voto-outro"}>
                  <Link href={`/parlamentares/${x.parlamentarId}`}>{x.nome}</Link>
                  <span>{x.partido} · {x.uf}</span>
                  <strong>{ROTULO_VOTO[x.voto] ?? x.voto}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
