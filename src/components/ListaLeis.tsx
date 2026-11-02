import { AbasLeis } from "@/components/AbasLeis";
import { ListaFiltravelLeis } from "@/components/ListaFiltravelLeis";
import type { Aba } from "@/lib/leis";
import { listarLeis } from "@/lib/queries/leis";

export async function ListaLeis({ aba }: { aba: Aba }) {
  const inicial = await listarLeis(aba);

  return (
    <>
      <h1>Leis e votações</h1>
      <p className="lead">O que foi votado nos plenários da Câmara e do Senado, quem propôs e como cada um votou.</p>
      <AbasLeis ativa={aba} />

      <ListaFiltravelLeis key={aba} aba={aba} inicial={inicial} />
      <p className="nota-rodape">
        O Senado só publica votações nominais e secretas; as simbólicas não aparecem nos dados abertos.
        {aba === "viraram-lei"
          ? " Uma lei votada nas duas casas aparece uma vez só, com o aviso de que também foi votada na outra."
          : " Nas demais abas, uma mesma proposição pode aparecer duas vezes, uma por casa."}
      </p>
    </>
  );
}
