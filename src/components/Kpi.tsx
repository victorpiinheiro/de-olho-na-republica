export function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-rotulo">{rotulo}</div>
      <div className="kpi-valor">{valor}</div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  );
}
