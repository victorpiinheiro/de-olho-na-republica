import { PainelHistoria } from "@/components/PainelHistoria";
import { listarPresidentes } from "@/lib/queries/historia";

// Carga única: a página é estática.
export const revalidate = false;

export default async function Page() {
  const { presidentes, hoje } = await listarPresidentes();
  return (
    <>
      <h1>História do país</h1>
      <p className="lead">
        Os presidentes da República desde 1889, em linha do tempo, por período histórico. Clique num mandato ou
        numa pessoa da lista para ver os dados.
      </p>
      {presidentes.length === 0 ? (
        <div className="card">Ainda não há presidentes carregados.</div>
      ) : (
        <PainelHistoria presidentes={presidentes} hoje={hoje} />
      )}
    </>
  );
}
