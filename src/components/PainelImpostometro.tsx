"use client";

import { useEffect, useState } from "react";
import { GraficoArrecadacao } from "@/components/GraficoArrecadacao";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import { brlGrande, brlInteiro, MESES_COMPLETOS, pct } from "@/lib/format";
import {
  acumuladoEm,
  arrecadadoHoje,
  inicioDoMes,
  mesCorrente,
  montarSerie,
  taxaPorSegundo,
} from "@/lib/impostometro";
import { nomeUf } from "@/lib/ufs";
import type { EsferaTela, ImpostometroPorEsfera } from "@/lib/queries/impostometro";

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

// `geradoEm` vem do servidor: o primeiro render do navegador usa o mesmo valor (sem erro de hidratação).
const ROTULO_ESFERA: Record<EsferaTela, string> = {
  total: "tributos federais e estaduais",
  federal: "tributos federais",
  estadual: "tributos estaduais",
};

export function PainelImpostometro({ todas }: { todas: ImpostometroPorEsfera }) {
  const [esfera, setEsfera] = useState<EsferaTela>(todas.total ? "total" : "federal");
  // UFs desligadas no filtro da aba Estadual (vazio = todas).
  const [ufsOff, setUfsOff] = useState<ReadonlySet<string>>(new Set());
  const completos = todas[esfera] ?? todas.federal;
  const agora = useAgora(completos?.geradoEm ?? 0);
  if (!completos) return null;

  const porUf = esfera === "estadual" ? completos.linhasPorUf : undefined;
  const ufs = porUf ? Object.keys(porUf).sort() : [];
  const filtrando = ufsOff.size > 0 && ufs.length > 0;
  const recorte = filtrando && porUf ? montarSerie(ufs.filter((u) => !ufsOff.has(u)).flatMap((u) => porUf[u]), completos.ano) : null;
  const dados = recorte ? { ...completos, ...recorte } : completos;
  const alternarUf = (uf: string) => {
    const novo = new Set(ufsOff);
    if (novo.has(uf)) novo.delete(uf);
    else if (ufs.length - novo.size > 1) novo.add(uf); // sempre sobra ao menos um estado
    setUfsOff(novo);
  };
  const selecionados = ufs.length - ufsOff.size;
  const escopo = !filtrando
    ? ROTULO_ESFERA[esfera]
    : ufsOff.size <= 5
      ? `tributos estaduais, sem ${[...ufsOff].sort().join(", ")}`
      : `tributos de ${selecionados} estado${selecionados > 1 ? "s" : ""}`;
  const { ano, meses, ultimoMesOficial, porTributo, populacao, variacaoReal } = dados;

  const acumulado = acumuladoEm(agora, ano, meses);
  const taxa = taxaPorSegundo(agora, ano, meses);
  const corrente = mesCorrente(agora, ano, meses);
  const diaDoAno = Math.min(365, Math.floor((agora - inicioDoMes(ano, 1)) / DIA_MS) + 1);
  const totalDias = Math.round((inicioDoMes(ano + 1, 1) - inicioDoMes(ano, 1)) / DIA_MS);

  const projetados = meses.filter((m) => m.estimado).map((m) => MESES_COMPLETOS[m.mes - 1]);
  const totalTributos = porTributo.reduce((s, t) => s + t.valor, 0);

  return (
    <>
      <div className="alternancia" role="group" aria-label="Esfera">
        {(["total", "federal", "estadual"] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={`aba${esfera === e ? " aba-ativa" : ""}${todas[e] ? "" : " aba-off"}`}
            aria-pressed={esfera === e}
            disabled={!todas[e]}
            title={todas[e] ? undefined : "Dados ainda não carregados"}
            onClick={() => setEsfera(e)}
          >
            {e === "total" ? "Total" : e === "federal" ? "Federal" : "Estadual"}
          </button>
        ))}
        <button type="button" className="aba aba-off" disabled title="Sem fonte de dados ainda">Municipal · em breve</button>
      </div>

      {ufs.length > 0 && (
        <div className="filtro-ufs" role="group" aria-label="Estados incluídos">
          <div className="filtro-ufs-topo">
            <span>Estados incluídos · {selecionados} de {ufs.length}</span>
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

      <section className="card contador" aria-labelledby="titulo-contador">
        <div className="contador-rotulo" id="titulo-contador">
          Arrecadado em {ano} · Brasil, {escopo}
        </div>
        <div className="contador-linha">
          <div>
            <div className="contador-valor" aria-label={`Estimativa de ${brlGrande(acumulado)} arrecadados em ${ano}`}>
              <span className="contador-moeda">R$</span> {centavos(acumulado)}
            </div>
            <p className="contador-base">
              Estimativa · base oficial até {MESES_COMPLETOS[ultimoMesOficial - 1]}/{ano}
              {projetados.length > 0 && <> · {projetados.join(", ")} projetado{projetados.length > 1 ? "s" : ""} pelo mesmo mês de {ano - 1} corrigido pelo crescimento médio</>}
            </p>
          </div>
          <div className="contador-ano">
            <div className="contador-ano-topo">
              <span>Ano decorrido</span>
              <span>dia {diaDoAno} de {totalDias}</span>
            </div>
            <Barra valor={diaDoAno} maximo={totalDias} />
            <p>+ R$ {Math.round(taxa).toLocaleString("pt-BR")} por segundo</p>
          </div>
        </div>
      </section>

      <div className="kpis kpis-4">
        <Kpi rotulo="Hoje" valor={brlGrande(arrecadadoHoje(agora, ano, meses))} nota="desde 00h00" />
        {corrente && (
          <Kpi
            rotulo={`Em ${MESES_COMPLETOS[corrente.mes - 1]}`}
            valor={brlGrande(corrente.valor)}
            nota={corrente.estimado ? "projeção do mês" : "arrecadação oficial do mês"}
          />
        )}
        {populacao && !filtrando && <Kpi rotulo="Por habitante" valor={brlInteiro(acumulado / populacao)} nota="no ano, média" />}
        {variacaoReal && (
          <Kpi
            rotulo="Variação real"
            valor={`${variacaoReal.variacao >= 0 ? "+" : "−"}${pct(Math.abs(variacaoReal.variacao))}`}
            nota={`jan–${MESES_COMPLETOS[variacaoReal.ateMes - 1].slice(0, 3)} vs. ${ano - 1}, a preços constantes (IPCA)`}
          />
        )}
      </div>

      <div className="impostometro-graficos">
        <section className="card" aria-labelledby="titulo-mensal">
          <div className="grafico-topo">
            <h2 id="titulo-mensal">Arrecadação mensal</h2>
            <ul className="placar-legenda">
              <li><i className="chip chip-oficial" /> Oficial</li>
              <li><i className="chip chip-estimado" /> Estimado</li>
            </ul>
          </div>
          <GraficoArrecadacao meses={meses} />
          <p className="nota-grafico">Valores em R$ bilhões, nominais.</p>
        </section>

        <section className="card" aria-labelledby="titulo-tributo">
          <h2 id="titulo-tributo">Por tributo</h2>
          <p className="nota-grafico">Acumulado oficial de janeiro a {MESES_COMPLETOS[ultimoMesOficial - 1]}.</p>
          <ul className="tributos">
            {porTributo.map((t) => (
              <li key={t.tributo}>
                <div className="tributos-topo">
                  <span>{t.tributo}</span>
                  <span>{Math.round((t.valor / totalTributos) * 100)}% · {brlGrande(t.valor)}</span>
                </div>
                <Barra valor={t.valor} maximo={porTributo[0].valor} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
