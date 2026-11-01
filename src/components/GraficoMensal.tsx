import { MESES } from "@/lib/format";

// Colunas verticais em CSS puro. Valores em R$ mil, como no mockup.
export function GraficoMensal({ mensal }: { mensal: { mes: number; valor: number }[] }) {
  const maximo = Math.max(0, ...mensal.map((m) => m.valor));
  return (
    <div className="grafico-mensal" role="img" aria-label="Gasto por mês, em milhares de reais">
      {mensal.map((m) => (
        <div key={m.mes} className="coluna">
          <span className="coluna-valor">{Math.round(m.valor / 1000)}</span>
          <div className="coluna-area">
            <div
              className="coluna-barra"
              style={{ height: `${maximo > 0 ? Math.max(2, (m.valor / maximo) * 100) : 0}%` }}
            />
          </div>
          <span className="coluna-mes">{MESES[m.mes - 1]}</span>
        </div>
      ))}
    </div>
  );
}
