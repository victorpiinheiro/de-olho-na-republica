export type TomBarra = "accent" | "a" | "b" | "a-claro" | "b-claro" | "neutro";

export function Barra({
  valor,
  maximo,
  tom = "accent",
}: {
  valor: number;
  maximo: number;
  tom?: TomBarra;
}) {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <div className="barra" aria-hidden="true">
      <div className={`barra-cheia barra-${tom}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
