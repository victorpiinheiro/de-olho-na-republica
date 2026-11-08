import { PainelOrcamento } from "@/components/PainelOrcamento";
import { carregarOrcamento } from "@/lib/queries/orcamento";

// Atualiza com o RREO, que sai a cada bimestre.
export const metadata = {
  title: "Orçamento da União",
  description:
    "Despesa da União por função de governo, executada no ano, com as subfunções. Dados do Tesouro Nacional (Siconfi).",
};

export const revalidate = 86400;

export default async function Page() {
  const anos = await carregarOrcamento();
  return (
    <>
      <h1>Orçamento da União</h1>
      <p className="lead">
        Quanto o governo federal já gastou em cada área, e quanto estava previsto no orçamento. Dados oficiais do
        Tesouro Nacional (Siconfi), por função de governo.
      </p>
      {anos.length === 0 ? (
        <div className="card">Ainda não há dados de orçamento carregados.</div>
      ) : (
        <PainelOrcamento anos={anos} />
      )}
    </>
  );
}
