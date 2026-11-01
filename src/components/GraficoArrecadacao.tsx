import { MESES } from "@/lib/format";
import type { MesTotal } from "@/lib/impostometro";

// Colunas verticais em CSS puro, em R$ bilhões. Mês estimado em cor mais clara.
export function GraficoArrecadacao({ meses }: { meses: MesTotal[] }) {
  const maximo = Math.max(0, ...meses.map((m) => m.valor));
  return (
    <div className="grafico-mensal" role="img" aria-label="Arrecadação por mês, em bilhões de reais">
      {meses.map((m) => (
        <div key={m.mes} className="coluna">
          <span className="coluna-valor">{Math.round(m.valor / 1e9)}</span>
          <div className="coluna-area">
            <div
              className={`coluna-barra${m.estimado ? " coluna-estimada" : ""}`}
              style={{ height: `${maximo > 0 ? Math.max(2, (m.valor / maximo) * 100) : 0}%` }}
            />
          </div>
          <span className="coluna-mes">{MESES[m.mes - 1]}</span>
        </div>
      ))}
    </div>
  );
}
