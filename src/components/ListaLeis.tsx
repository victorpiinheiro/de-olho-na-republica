import { AbasLeis } from "@/components/AbasLeis";
import { ListaFiltravelLeis } from "@/components/ListaFiltravelLeis";
import type { Aba } from "@/lib/leis";
import { listarLeis } from "@/lib/queries/leis";

export async function ListaLeis({ aba }: { aba: Aba }) {
  const leis = await listarLeis(aba);

  return (
    <>
      <h1>Leis e votações</h1>
      <p className="lead">O que foi votado nos plenários da Câmara e do Senado, quem propôs e como cada um votou.</p>
      <AbasLeis ativa={aba} />

      <ListaFiltravelLeis leis={leis} />
      {leis.length === 100 && <p className="lead">Mostrando as 100 proposições com votação mais recente.</p>}
      <p className="nota-rodape">
        O Senado só publica votações nominais e secretas; as simbólicas não aparecem nos dados abertos.
        Uma mesma proposição pode aparecer duas vezes, uma por casa.
      </p>
    </>
  );
}
