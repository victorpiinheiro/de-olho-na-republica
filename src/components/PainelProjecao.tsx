"use client";

import { useEffect, useState } from "react";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import { brlGrande, MESES_COMPLETOS } from "@/lib/format";
import { acumuladoEm, arrecadadoHoje, inicioDoMes, mesCorrente, taxaPorSegundo } from "@/lib/impostometro";
import type { DadosImpostometro } from "@/lib/queries/impostometro";

const DIA_MS = 86_400_000;
const centavos = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useAgora(inicial: number): number {
  const [agora, setAgora] = useState(inicial);
  useEffect(() => {
    // Sem animação para quem pede menos movimento: atualiza uma vez por segundo.
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setAgora(Date.now()), reduzido ? 1000 : 100);
    return () => clearInterval(id);
  }, []);
  return agora;
}

// Contador animado. É PROJEÇÃO: base oficial + meses estimados, distribuída por igual pelos segundos do mês.
// `geradoEm` vem do servidor: o primeiro render do navegador usa o mesmo valor (sem erro de hidratação).
export function PainelProjecao({ dados, escopo }: { dados: DadosImpostometro; escopo: string }) {
  const { ano, meses, ultimoMesOficial, geradoEm } = dados;
  const agora = useAgora(geradoEm);

  const acumulado = acumuladoEm(agora, ano, meses);
  const taxa = taxaPorSegundo(agora, ano, meses);
  const corrente = mesCorrente(agora, ano, meses);
  const diaDoAno = Math.min(365, Math.floor((agora - inicioDoMes(ano, 1)) / DIA_MS) + 1);
  const totalDias = Math.round((inicioDoMes(ano + 1, 1) - inicioDoMes(ano, 1)) / DIA_MS);
  const projetados = meses.filter((m) => m.estimado).map((m) => MESES_COMPLETOS[m.mes - 1]);

  return (
    <section className="projecao" aria-labelledby="titulo-projecao">
      <div className="projecao-topo">
        <h2 id="titulo-projecao">Projeção em tempo real</h2>
        <span className="selo-projecao">Projeção · não é dado oficial</span>
      </div>
      <p className="projecao-aviso">
        Nenhuma fonte pública informa a arrecadação “de agora”. Este contador é uma estimativa: parte da última
        informação oficial e supõe que o restante do ano seguirá o ritmo de {ano - 1}.
      </p>

      <div className="card contador">
        <div className="contador-rotulo">Projeção do arrecadado em {ano} · Brasil, {escopo}</div>
        <div className="contador-linha">
          <div>
            <div className="contador-valor" aria-label={`Projeção de ${brlGrande(acumulado)} arrecadados em ${ano}`}>
              <span className="contador-moeda">R$</span> {centavos(acumulado)}
            </div>
            <p className="contador-base">
              Base oficial até {MESES_COMPLETOS[ultimoMesOficial - 1]}/{ano}
              {projetados.length > 0 && (
                <> · {projetados.join(", ")} {projetados.length > 1 ? "projetados" : "projetado"} pelo mesmo mês de {ano - 1} corrigido pelo crescimento médio</>
              )}
            </p>
          </div>
          <div className="contador-ano">
            <div className="contador-ano-topo">
              <span>Ano decorrido</span>
              <span>dia {diaDoAno} de {totalDias}</span>
            </div>
            <Barra valor={diaDoAno} maximo={totalDias} />
            <p>+ R$ {Math.round(taxa).toLocaleString("pt-BR")} por segundo (média projetada)</p>
          </div>
        </div>
      </div>

      <div className="kpis kpis-2">
        <Kpi rotulo="Hoje (projeção)" valor={brlGrande(arrecadadoHoje(agora, ano, meses))} nota="desde 00h00" />
        {corrente && (
          <Kpi
            rotulo={`Em ${MESES_COMPLETOS[corrente.mes - 1]} (${corrente.estimado ? "projeção" : "oficial, rateado"})`}
            valor={brlGrande(corrente.valor)}
            nota={corrente.estimado ? "mês ainda não divulgado" : "total do mês, dividido igualmente pelos dias"}
          />
        )}
      </div>
    </section>
  );
}
