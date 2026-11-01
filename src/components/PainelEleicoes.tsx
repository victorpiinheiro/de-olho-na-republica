"use client";

import { useMemo, useState } from "react";
import { DisputaEleicao, ForaDoSegundoTurno, type Modo } from "@/components/DisputaEleicao";
import { Kpi } from "@/components/Kpi";
import { TabelaPorEstado } from "@/components/TabelaPorEstado";
import { pctDoComparecimento, pctDoEleitorado, type Cargo, type Disputa, type Turno } from "@/lib/eleicoes";
import { milhoes, pct, pontos } from "@/lib/format";
import { nomeUf } from "@/lib/ufs";

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "comparar", rotulo: "Comparar turnos" },
  { valor: "1", rotulo: "1º turno" },
  { valor: "2", rotulo: "2º turno" },
];

type Indicador = (t: Turno) => number;
const comparecimento: Indicador = (t) => pctDoEleitorado(t.comparecimento, t.aptos);
const abstencao: Indicador = (t) => pctDoEleitorado(t.abstencoes, t.aptos);
const brancosNulos: Indicador = (t) => pctDoComparecimento(t.brancosNulos, t.comparecimento);

function kpiTurnos(rotulo: string, ind: Indicador, t1: Turno, t2: Turno | null, modo: Modo, sufixoNota: string) {
  if (modo === "1" || !t2) return <Kpi rotulo={rotulo} valor={pct(ind(t1))} nota="no 1º turno" />;
  if (modo === "2") return <Kpi rotulo={rotulo} valor={pct(ind(t2))} nota="no 2º turno" />;
  return (
    <Kpi
      rotulo={rotulo}
      valor={`${pct(ind(t1))} → ${pct(ind(t2))}`}
      nota={`${pontos(ind(t2) - ind(t1))} ${sufixoNota}`}
    />
  );
}

export function PainelEleicoes({ disputas }: { disputas: Disputa[] }) {
  const [cargo, setCargo] = useState<Cargo>("Presidente");
  const [uf, setUf] = useState("BR");
  const [modo, setModo] = useState<Modo>("comparar");

  const ufsDoCargo = useMemo(
    () => disputas.filter((d) => d.cargo === cargo && d.uf !== "BR").map((d) => d.uf).sort(),
    [disputas, cargo],
  );

  function mudarCargo(novo: Cargo) {
    setCargo(novo);
    // Governador não tem visão nacional.
    setUf(novo === "Presidente" ? "BR" : uf === "BR" ? "SP" : uf);
  }

  const d = disputas.find((x) => x.cargo === cargo && x.uf === uf);
  const t1 = d?.turno1;
  const t2 = d?.turno2 ?? null;

  return (
    <>
      <div className="eleicoes-controles">
        <div className="filtros">
          <label>
            Cargo
            <select value={cargo} onChange={(e) => mudarCargo(e.target.value as Cargo)}>
              <option value="Presidente">Presidente</option>
              <option value="Governador">Governador</option>
            </select>
          </label>
          <label>
            Abrangência
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              {cargo === "Presidente" && <option value="BR">Brasil</option>}
              {ufsDoCargo.map((u) => (
                <option key={u} value={u}>{nomeUf(u)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="alternancia" role="group" aria-label="Turno">
          {MODOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              className={`aba${m.valor === modo ? " aba-ativa" : ""}`}
              aria-pressed={m.valor === modo}
              onClick={() => setModo(m.valor)}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      {!d || !t1 ? (
        <div className="card">Sem resultados para esta seleção.</div>
      ) : (
        <>
          <div className="kpis kpis-4">
            <Kpi rotulo="Eleitorado" valor={milhoes(t1.aptos)} nota="aptos a votar" />
            {kpiTurnos("Comparecimento", comparecimento, t1, t2, modo, "no 2º turno")}
            {kpiTurnos("Abstenção", abstencao, t1, t2, modo, "no 2º turno")}
            {kpiTurnos("Brancos e nulos", brancosNulos, t1, t2, modo, "no 2º turno")}
          </div>

          <DisputaEleicao d={d} modo={modo} />

          <div className="eleicoes-baixo">
            <ForaDoSegundoTurno d={d} />
            <TabelaPorEstado disputas={disputas} cargo={cargo} />
          </div>
        </>
      )}
    </>
  );
}
