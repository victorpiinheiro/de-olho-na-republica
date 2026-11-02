"use client";

import { useState } from "react";
import { DetalheEstadual, DetalheFederal } from "@/components/DetalheTributos";
import { PainelOficial } from "@/components/PainelOficial";
import { PainelProjecao } from "@/components/PainelProjecao";
import { montarSerie } from "@/lib/impostometro";
import type { EsferaTela } from "@/lib/oficial";
import type { ImpostometroCompleto } from "@/lib/queries/impostometro";
import { nomeUf } from "@/lib/ufs";

const ROTULO_ESFERA: Record<EsferaTela, string> = {
  total: "tributos federais (brutos) e estaduais (líquidos de repasses)",
  federal: "tributos federais",
  estadual: "tributos estaduais (líquidos de repasses)",
};

// Esfera e estados valem para os dois blocos: dados oficiais (recortes por mês/bimestre) e projeção (contador).
export function PainelImpostometro({ completo }: { completo: ImpostometroCompleto }) {
  const { projecao, oficial } = completo;
  const [esfera, setEsfera] = useState<EsferaTela>(projecao.total ? "total" : "federal");
  // UFs desligadas no filtro da aba Estadual (vazio = todas).
  const [ufsOff, setUfsOff] = useState<ReadonlySet<string>>(new Set());

  const base = projecao[esfera] ?? projecao.federal;
  if (!base) return null;

  const porUf = esfera === "estadual" ? base.linhasPorUf : undefined;
  const ufs = porUf ? Object.keys(porUf).sort() : [];
  const filtrando = ufsOff.size > 0 && ufs.length > 0;
  const selecionadas = ufs.filter((u) => !ufsOff.has(u));
  const recorte = filtrando && porUf ? montarSerie(selecionadas.flatMap((u) => porUf[u]), base.ano) : null;
  const dadosProjecao = recorte ? { ...base, ...recorte } : base;

  const alternarUf = (uf: string) => {
    const novo = new Set(ufsOff);
    if (novo.has(uf)) novo.delete(uf);
    else if (ufs.length - novo.size > 1) novo.add(uf); // sempre sobra ao menos um estado
    setUfsOff(novo);
  };
  const escopo = !filtrando
    ? ROTULO_ESFERA[esfera]
    : ufsOff.size <= 5
      ? `tributos estaduais líquidos de repasses, sem ${[...ufsOff].sort().join(", ")}`
      : `tributos líquidos de repasses de ${selecionadas.length} estado${selecionadas.length > 1 ? "s" : ""}`;

  return (
    <>
      <div className="alternancia" role="group" aria-label="Esfera">
        {(["total", "federal", "estadual"] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={`aba${esfera === e ? " aba-ativa" : ""}${projecao[e] ? "" : " aba-off"}`}
            aria-pressed={esfera === e}
            disabled={!projecao[e]}
            title={projecao[e] ? undefined : "Dados ainda não carregados"}
            onClick={() => setEsfera(e)}
          >
            {e === "total" ? "Total" : e === "federal" ? "Federal" : "Estadual"}
          </button>
        ))}
      </div>

      {ufs.length > 0 && (
        <div className="filtro-ufs" role="group" aria-label="Estados incluídos">
          <div className="filtro-ufs-topo">
            <span>Estados incluídos · {selecionadas.length} de {ufs.length}</span>
            <button type="button" className="link-botao" onClick={() => setUfsOff(new Set())} disabled={!filtrando}>Todos</button>
          </div>
          <div className="filtro-ufs-lista">
            {ufs.map((uf) => (
              <button
                key={uf}
                type="button"
                className={`aba${ufsOff.has(uf) ? "" : " aba-ativa"}`}
                aria-pressed={!ufsOff.has(uf)}
                title={nomeUf(uf)}
                onClick={() => alternarUf(uf)}
              >
                {uf}
              </button>
            ))}
          </div>
        </div>
      )}

      <PainelOficial
        series={oficial.series}
        ano={oficial.ano}
        populacao={oficial.populacao}
        esfera={esfera}
        ufs={filtrando ? new Set(selecionadas) : null}
      />
      {esfera !== "estadual" && completo.detalhe.federal && <DetalheFederal d={completo.detalhe.federal} />}
      {esfera !== "federal" && completo.detalhe.estadual && (
        <DetalheEstadual d={completo.detalhe.estadual} ufs={filtrando ? new Set(selecionadas) : null} />
      )}
      <PainelProjecao dados={dadosProjecao} escopo={escopo} />
    </>
  );
}
