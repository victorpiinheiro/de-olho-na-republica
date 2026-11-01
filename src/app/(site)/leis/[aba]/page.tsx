import { notFound } from "next/navigation";
import { ListaLeis } from "@/components/ListaLeis";
import { ABAS, type Aba } from "@/lib/leis";

export const revalidate = 3600;
export const dynamicParams = false;

const ABAS_ROTA = ABAS.filter((a) => a.chave !== "todas");

export function generateStaticParams() {
  return ABAS_ROTA.map((a) => ({ aba: a.chave }));
}

export default async function Page({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  const encontrada = ABAS_ROTA.find((a) => a.chave === aba);
  if (!encontrada) notFound();
  return <ListaLeis aba={encontrada.chave as Aba} />;
}
