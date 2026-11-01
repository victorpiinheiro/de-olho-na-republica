"use client";

import { useMemo, useState } from "react";
import { CardLei } from "@/components/CardLei";
import type { CardLei as Card } from "@/lib/queries/leis";

type Periodo = "todos" | "30" | "365";

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ListaFiltravelLeis({ leis }: { leis: Card[] }) {
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  // Calculado no evento (e não no render): "agora" muda a cada chamada.
  const [corte, setCorte] = useState(0);

  function mudarPeriodo(p: Periodo) {
    setPeriodo(p);
    setCorte(p === "todos" ? 0 : Date.now() - Number(p) * 86_400_000);
  }

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return leis.filter(
      (l) =>
        (!termo || semAcento(`${l.codigo} ${l.ementa} ${l.autoria?.texto ?? ""}`).includes(termo)) &&
        (corte === 0 || (l.destaque && new Date(l.destaque.dataIso).getTime() >= corte)),
    );
  }, [leis, busca, corte]);

  return (
    <>
      <div className="filtros filtros-leis">
        <label>
          Buscar
          <input
            type="search"
            placeholder="Número, ementa ou autor (ex.: PL 2418/2026)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <label>
          Período da última votação
          <select value={periodo} onChange={(e) => mudarPeriodo(e.target.value as Periodo)}>
            <option value="todos">Todo o período</option>
            <option value="30">Últimos 30 dias</option>
            <option value="365">Últimos 12 meses</option>
          </select>
        </label>
      </div>

      <div className="lista-leis-cabecalho">
        <span>{filtradas.length} {filtradas.length === 1 ? "proposição" : "proposições"}</span>
        <ul className="placar-legenda">
          <li><i className="chip chip-sim" /> Sim</li>
          <li><i className="chip chip-nao" /> Não</li>
          <li><i className="chip chip-abst" /> Abstenção</li>
        </ul>
      </div>

      <div className="lista-leis">
        {filtradas.map((l) => (
          <CardLei key={l.id} lei={l} />
        ))}
        {filtradas.length === 0 && <div className="card vazio">Nenhuma proposição encontrada.</div>}
      </div>
    </>
  );
}
