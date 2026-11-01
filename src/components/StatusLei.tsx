import type { TomStatus } from "@/lib/leis";

export function StatusLei({
  rotulo,
  tom,
  normaJuridica,
}: {
  rotulo: string;
  tom: TomStatus;
  normaJuridica?: string | null;
}) {
  return (
    <span className={`status status-${tom}`}>
      {rotulo}
      {tom === "lei" && normaJuridica ? ` · ${normaJuridica}` : ""}
    </span>
  );
}
