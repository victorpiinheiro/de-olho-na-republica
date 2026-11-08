import { PainelEleicoes } from "@/components/PainelEleicoes";
import { listarDisputas } from "@/lib/queries/eleicoes";

export const metadata = {
  title: "Eleições 2026",
  description:
    "Resultados das eleições 2026 do TSE: comparação entre o 1º e o 2º turno por cargo e estado.",
};

export const revalidate = false;

export default async function Page() {
  const disputas = await listarDisputas();
  return (
    <>
      <h1>Eleições 2026</h1>
      <p className="lead">
        Resultados oficiais do TSE, com comparação entre o 1º e o 2º turno por cargo e por estado.
      </p>
      {disputas.length === 0 ? (
        <div className="card">Ainda não há resultados carregados.</div>
      ) : (
        <PainelEleicoes disputas={disputas} />
      )}
    </>
  );
}
