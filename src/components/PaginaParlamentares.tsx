import { AlternanciaCasa } from "@/components/AlternanciaCasa";
import { ListaParlamentares } from "@/components/ListaParlamentares";
import { MESES } from "@/lib/format";
import type { CasaLegislativa } from "@/lib/leis";
import { contarEmExercicio, listarRanking } from "@/lib/queries/parlamentares";

const TEXTO = {
  CAMARA: "Gastos com a cota parlamentar, notas fiscais e presença em votações de deputados federais.",
  SENADO:
    "Gastos com a cota parlamentar (CEAPS), documentos e presença em votações nominais de senadores. O Senado só publica votações nominais e secretas.",
} as const;

export async function PaginaParlamentares({ casa }: { casa: CasaLegislativa }) {
  const agora = new Date();
  const ano = agora.getFullYear();
  const [{ linhas, nominais }, camara, senado] = await Promise.all([
    listarRanking(ano, casa),
    contarEmExercicio("CAMARA"),
    contarEmExercicio("SENADO"),
  ]);
  const periodo = `jan–${MESES[agora.getMonth()]!.toLowerCase()} ${ano}`;

  return (
    <>
      <h1>Parlamentares</h1>
      <p className="lead">{TEXTO[casa]}</p>
      <AlternanciaCasa ativa={casa} camara={camara} senado={senado} />
      <ListaParlamentares linhas={linhas} ano={ano} periodo={periodo} nominais={nominais} casa={casa} />
    </>
  );
}
