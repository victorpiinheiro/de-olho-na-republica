"use client";

import { useState } from "react";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import { brlGrande, MESES_COMPLETOS, pct } from "@/lib/format";
import type { FuncaoOrc, OrcamentoAno } from "@/lib/queries/orcamento";

const ENCARGOS = "Encargos Especiais";

// "FU10 - Administração Geral" é a administração geral DA função; a fonte prefixa para não repetir o nome.
const nomeSubfuncao = (n: string) => n.replace(/^FU\d+ - /, "");
const percentual = (parte: number, todo: number) => (todo > 0 ? pct((parte / todo) * 100) : "—");

function Funcao({ f, total, maximo }: { f: FuncaoOrc; total: number; maximo: number }) {
  const liq = f.liquidado ?? 0;
  const subs = f.subfuncoes.filter((s) => (s.liquidado ?? 0) > 0).sort((a, b) => (b.liquidado ?? 0) - (a.liquidado ?? 0));
  return (
    <li>
      <details className="orc-funcao">
        <summary>
          <span className="orc-nome">{f.nome}</span>
          <span className="orc-valor">{brlGrande(liq)} · {percentual(liq, total)}</span>
          <span className="orc-barra"><Barra valor={liq} maximo={maximo} /></span>
        </summary>
        <div className="orc-detalhe">
          <p className="orc-nota">
            Previsto (dotação atualizada): {f.dotacao === null ? "—" : brlGrande(f.dotacao)} · Empenhado:{" "}
            {f.empenhado === null ? "—" : brlGrande(f.empenhado)} · Executado (liquidado): {brlGrande(liq)}
            {f.dotacao ? ` (${percentual(liq, f.dotacao)} do previsto)` : ""}
          </p>
          {f.nome === ENCARGOS && (
            <p className="orc-nota">
              Despesas sem um bem ou serviço associado: pagamento da dívida pública, transferências a estados e
              municípios e outros encargos. Não é gasto numa área específica.
            </p>
          )}
          {subs.length > 0 && (
            <table className="tabela orc-subs">
              <thead>
                <tr>
                  <th>Subfunção</th>
                  <th className="num">Executado</th>
                  <th className="num">% da área</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.nome}>
                    <td>{nomeSubfuncao(s.nome)}</td>
                    <td className="num">{brlGrande(s.liquidado ?? 0)}</td>
                    <td className="num">{percentual(s.liquidado ?? 0, liq)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </li>
  );
}

export function PainelOrcamento({ anos }: { anos: OrcamentoAno[] }) {
  const [ano, setAno] = useState(anos[0].ano);
  const o = anos.find((a) => a.ano === ano) ?? anos[0];

  const executadas = o.funcoes.filter((f) => (f.liquidado ?? 0) > 0).sort((a, b) => (b.liquidado ?? 0) - (a.liquidado ?? 0));
  const maximo = executadas[0]?.liquidado ?? 0;
  const encargos = o.funcoes.find((f) => f.nome === ENCARGOS);
  const reserva = o.funcoes.find((f) => (f.liquidado ?? 0) === 0 && (f.dotacao ?? 0) > 0);
  const fimMes = MESES_COMPLETOS[o.bimestre * 2 - 1];
  const completo = o.bimestre === 6;

  return (
    <>
      <div className="alternancia" role="group" aria-label="Ano">
        {anos.map((a) => (
          <button key={a.ano} type="button" className={`aba${a.ano === o.ano ? " aba-ativa" : ""}`} aria-pressed={a.ano === o.ano} onClick={() => setAno(a.ano)}>
            {a.ano}{a.bimestre < 6 ? " (parcial)" : ""}
          </button>
        ))}
      </div>

      <p className="projecao-aviso">
        {completo ? `Ano de ${o.ano} completo` : `Acumulado de janeiro a ${fimMes} de ${o.ano} (${o.bimestre}º bimestre)`}. Valores em
        despesa liquidada: o serviço foi prestado ou o bem entregue. Fonte: Tesouro Nacional (Siconfi), RREO-Anexo 02.
      </p>

      <div className="kpis kpis-4">
        <Kpi rotulo="Executado (liquidado)" valor={brlGrande(o.total.liquidado)} nota={`jan–${fimMes.slice(0, 3)}/${o.ano}`} />
        <Kpi rotulo="Previsto no orçamento" valor={brlGrande(o.total.dotacao)} nota="dotação atualizada do ano" />
        <Kpi rotulo="Executado do previsto" valor={percentual(o.total.liquidado, o.total.dotacao)} nota={completo ? "no ano" : "até aqui, do orçamento do ano todo"} />
        {encargos && (
          <Kpi rotulo="Encargos especiais" valor={percentual(encargos.liquidado ?? 0, o.total.liquidado)} nota="dívida e transferências, do total" />
        )}
      </div>

      <section className="card" aria-labelledby="titulo-areas">
        <h2 id="titulo-areas">Por área de governo</h2>
        <p className="nota-grafico">Clique numa área para ver as subfunções. Percentual sobre o total executado.</p>
        <ul className="orc-lista">
          {executadas.map((f) => (
            <Funcao key={f.nome} f={f} total={o.total.liquidado} maximo={maximo} />
          ))}
        </ul>
        {reserva && (
          <p className="nota-grafico">
            {reserva.nome}: {brlGrande(reserva.dotacao ?? 0)} previstos, sem execução (reserva para imprevistos).
          </p>
        )}
      </section>

      <section className="card metodologia" aria-labelledby="titulo-orc-metodo">
        <h2 id="titulo-orc-metodo">Como ler estes números</h2>
        <p className="metodologia-nota">
          São despesas do governo federal (Executivo, Legislativo, Judiciário e demais órgãos) do orçamento fiscal e da
          seguridade, por função de governo, sem as despesas intra-orçamentárias (repasses entre órgãos do próprio
          governo, que contariam duas vezes). “Liquidado” é a despesa reconhecida como executada; “empenhado” é o valor
          reservado; “dotação atualizada” é o previsto no orçamento depois dos ajustes do ano. Executado não significa
          “investimento”: investimento é só uma categoria de despesa, e aqui aparecem também salários, benefícios da
          Previdência e a dívida. Estados e municípios não estão incluídos.
        </p>
      </section>
    </>
  );
}
