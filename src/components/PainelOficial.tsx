"use client";

import { useState } from "react";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import { brlGrande, brlInteiro, MESES, MESES_COMPLETOS, pct, pctFatia } from "@/lib/format";
import {
  calcular,
  granularidadesPermitidas,
  tributosDisponiveis,
  type EsferaTela,
  type Granularidade,
  type Selecao,
  type SerieOficial,
} from "@/lib/oficial";

const GRAN: Record<Granularidade, string> = { mes: "Mês", bimestre: "Bimestre", acumulado: "Acumulado no ano" };
const FONTE: Record<EsferaTela, string> = {
  federal: "Receita Federal",
  estadual: "Tesouro Nacional (Siconfi)",
  total: "Receita Federal e Tesouro Nacional (Siconfi)",
};
// O Federal é bruto; o RREO dos estados vem líquido de repasses aos municípios e FUNDEB.
const ESCOPO: Record<EsferaTela, string> = {
  federal: "",
  estadual: " · líquido de repasses",
  total: " · federal bruto + estadual líquido",
};

// Último mês publicado de uma esfera (0 se nenhum).
function ultimoMes(series: SerieOficial[], esfera: SerieOficial["esfera"], ano: number): number {
  let ate = 0;
  for (const s of series) {
    if (s.esfera !== esfera || s.ano !== ano) continue;
    s.valores.forEach((v, i) => v !== null && (ate = Math.max(ate, i + 1)));
  }
  return ate;
}

const sinal = (n: number) => `${n >= 0 ? "+" : "−"}${pct(Math.abs(n))}`;

export function PainelOficial({
  series,
  ano,
  populacao,
  esfera,
  ufs,
}: {
  series: SerieOficial[];
  ano: number;
  populacao: number | null;
  esfera: EsferaTela;
  ufs: ReadonlySet<string> | null; // UFs incluídas na aba Estadual (null = todas)
}) {
  const [gran, setGran] = useState<Granularidade>("mes");
  const [periodo, setPeriodo] = useState<number | null>(null);
  const [tributosOff, setTributosOff] = useState<ReadonlySet<string>>(new Set());

  const disponiveis = tributosDisponiveis(series, esfera);
  const off = new Set([...tributosOff].filter((t) => disponiveis.includes(t)));
  const sel: Selecao = {
    esfera,
    ufs: esfera === "estadual" ? ufs : null,
    tributos: off.size > 0 ? new Set(disponiveis.filter((t) => !off.has(t))) : null,
  };
  const permitidas = granularidadesPermitidas(series, sel);
  const r = calcular(series, sel, ano, gran, periodo);

  const alternarTributo = (t: string) => {
    const novo = new Set(off);
    if (novo.has(t)) novo.delete(t);
    else if (disponiveis.length - novo.size > 1) novo.add(t); // sempre sobra ao menos um tributo
    setTributosOff(novo);
  };

  const rotuloPeriodo = (n: number) => (r.unidade === "mes" ? MESES_COMPLETOS[n - 1] : `${n}º bimestre`);
  const primeiroMes = r.mesesCobertos[0];
  const ultimoMesCob = r.mesesCobertos[r.mesesCobertos.length - 1];
  const titulo =
    r.mesesCobertos.length === 0
      ? "sem dado oficial para este recorte"
      : r.granularidade === "mes"
        ? `${MESES_COMPLETOS[primeiroMes - 1]} de ${ano}`
        : r.granularidade === "bimestre"
          ? `${r.selecionado}º bimestre de ${ano} (${MESES[primeiroMes - 1].toLowerCase()}–${MESES[ultimoMesCob - 1].toLowerCase()})`
          : `Acumulado de ${MESES[primeiroMes - 1].toLowerCase()} a ${MESES[ultimoMesCob - 1].toLowerCase()} de ${ano}`;

  const federalAte = ultimoMes(series, "FEDERAL", ano);
  const estadualAte = ultimoMes(series, "ESTADUAL", ano);
  const mostraFed = esfera !== "estadual";
  const mostraEst = esfera !== "federal";
  const maximo = Math.max(0, ...r.periodos.map((p) => p.valor ?? 0));
  const porHabitante = populacao && r.valor !== null && !(esfera === "estadual" && ufs) ? r.valor / populacao : null;
  const totalTributos = r.porTributo.reduce((s, t) => s + t.valor, 0);

  return (
    <section className="oficial" aria-labelledby="titulo-oficial">
      <div className="projecao-topo">
        <h2 id="titulo-oficial">Dados oficiais</h2>
        <span className="selo-oficial">Publicado pela fonte · sem projeção</span>
      </div>
      <p className="projecao-aviso">
        Fonte: {FONTE[esfera]}.{" "}
        {mostraFed && federalAte > 0 && <>Federal publicado até {MESES_COMPLETOS[federalAte - 1]}/{ano}. </>}
        {mostraEst && estadualAte > 0 && <>Estadual publicado até {MESES_COMPLETOS[estadualAte - 1]}/{ano}, por bimestre. </>}
        {esfera === "total" && "O total só soma os períodos que as duas fontes já divulgaram."}
      </p>

      <div className="oficial-controles">
        <div className="alternancia" role="group" aria-label="Granularidade">
          {(["mes", "bimestre", "acumulado"] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={`aba${r.granularidade === g ? " aba-ativa" : ""}${permitidas.includes(g) ? "" : " aba-off"}`}
              aria-pressed={r.granularidade === g}
              disabled={!permitidas.includes(g)}
              title={permitidas.includes(g) ? undefined : "O estadual é publicado só por bimestre"}
              onClick={() => { setGran(g); setPeriodo(null); }}
            >
              {GRAN[g]}
            </button>
          ))}
        </div>

        {r.granularidade !== "acumulado" && (
          <div className="filtro-ufs-lista" role="group" aria-label="Período">
            {r.periodos.map((p) => (
              <button
                key={p.n}
                type="button"
                className={`aba${r.selecionado === p.n ? " aba-ativa" : ""}`}
                aria-pressed={r.selecionado === p.n}
                disabled={p.valor === null}
                title={p.valor === null ? "Ainda não publicado" : rotuloPeriodo(p.n)}
                onClick={() => setPeriodo(p.n)}
              >
                {r.unidade === "mes" ? MESES[p.n - 1] : `${p.n}º bim.`}
              </button>
            ))}
          </div>
        )}

        <div className="filtro-ufs">
          <div className="filtro-ufs-topo">
            <span>Tributos incluídos · {disponiveis.length - off.size} de {disponiveis.length}</span>
            <button type="button" className="link-botao" onClick={() => setTributosOff(new Set())} disabled={off.size === 0}>Todos</button>
          </div>
          <div className="filtro-ufs-lista">
            {disponiveis.map((t) => (
              <button key={t} type="button" className={`aba${off.has(t) ? "" : " aba-ativa"}`} aria-pressed={!off.has(t)} onClick={() => alternarTributo(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card oficial-destaque">
        <div className="contador-rotulo">Arrecadado oficial · {titulo}{ESCOPO[esfera]}</div>
        <div className="contador-valor oficial-valor">
          {r.valor === null ? "—" : <><span className="contador-moeda">R$</span> {brlGrande(r.valor).replace(/^R\$\s?/, "")}</>}
        </div>
      </div>

      {esfera !== "federal" && (
        <p className="nota-grafico nota-liquido">
          <strong>Atenção:</strong> os valores estaduais deste bloco são <strong>líquidos</strong>: o RREO já desconta os repasses
          constitucionais aos municípios e o FUNDEB, e cada estado contabiliza essas deduções de um jeito. O valor{" "}
          <strong>bruto</strong>, por imposto (ICMS, IPVA e outros), está no bloco “Estadual por imposto”, mais abaixo
          {esfera === "total" ? ". Por isso o Total soma um Federal bruto com um Estadual líquido" : ""}.
        </p>
      )}

      <div className="kpis kpis-3">
        {r.variacao !== null && r.anterior !== null && (
          <Kpi
            rotulo={`Nominal vs. mesmo período de ${ano - 1}`}
            valor={sinal(r.variacao)}
            nota={`${brlGrande(r.anterior)} em ${ano - 1}`}
          />
        )}
        {r.variacaoReal !== null && (
          <Kpi rotulo="Variação real (IPCA)" valor={sinal(r.variacaoReal)} nota={`vs. ${ano - 1}, a preços constantes, só federal`} />
        )}
        {porHabitante !== null && <Kpi rotulo="Por habitante" valor={brlInteiro(porHabitante)} nota="no período, média do Brasil" />}
      </div>

      <div className="impostometro-graficos">
        <section className="card" aria-labelledby="titulo-oficial-grafico">
          <div className="grafico-topo">
            <h2 id="titulo-oficial-grafico">{r.unidade === "mes" ? "Por mês" : "Por bimestre"}</h2>
          </div>
          <div className="grafico-mensal" role="img" aria-label="Arrecadação oficial por período, em bilhões de reais">
            {r.periodos.map((p) => {
              const ativo = r.granularidade === "acumulado" ? p.valor !== null && r.mesesCobertos.includes(r.unidade === "mes" ? p.n : 2 * p.n) : r.selecionado === p.n;
              return (
                <div key={p.n} className="coluna">
                  <span className="coluna-valor">{p.valor === null ? "" : Math.round(p.valor / 1e9)}</span>
                  <div className="coluna-area">
                    {p.valor !== null && (
                      <div
                        className={`coluna-barra${ativo ? "" : " coluna-estimada"}`}
                        style={{ height: `${maximo > 0 ? Math.max(2, (p.valor / maximo) * 100) : 0}%` }}
                      />
                    )}
                  </div>
                  <span className="coluna-mes">{r.unidade === "mes" ? MESES[p.n - 1] : `${p.n}º`}</span>
                </div>
              );
            })}
          </div>
          <p className="nota-grafico">Valores em R$ bilhões, nominais. Períodos vazios ainda não foram publicados.</p>
        </section>

        <section className="card" aria-labelledby="titulo-oficial-tributo">
          <h2 id="titulo-oficial-tributo">Por tributo</h2>
          <p className="nota-grafico">{titulo}.</p>
          <ul className="tributos">
            {r.porTributo.map((t) => (
              <li key={t.tributo}>
                <div className="tributos-topo">
                  <span>{t.tributo}</span>
                  <span>{pctFatia(t.valor, totalTributos)} · {brlGrande(t.valor)}</span>
                </div>
                <Barra valor={t.valor} maximo={totalTributos} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
