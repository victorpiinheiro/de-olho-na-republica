import { notFound } from "next/navigation";
import { ListaLeis } from "@/components/ListaLeis";
import type { Metadata } from "next";
import { ABAS, type Aba } from "@/lib/leis";
import { cortar } from "@/lib/site";

export const revalidate = 3600;
export const dynamicParams = false;

const ABAS_ROTA = ABAS.filter((a) => a.chave !== "todas");

export function generateStaticParams() {
  return ABAS_ROTA.map((a) => ({ aba: a.chave }));
}

export async function generateMetadata({ params }: { params: Promise<{ aba: string }> }): Promise<Metadata> {
  const { aba } = await params;
  const a = ABAS_ROTA.find((x) => x.chave === aba);
  if (!a) return {};
  return { title: `${a.rotulo}: leis e votações`, description: cortar(a.explicacao.texto, 160) };
}

export default async function Page({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  const encontrada = ABAS_ROTA.find((a) => a.chave === aba);
  if (!encontrada) notFound();
  return <ListaLeis aba={encontrada.chave as Aba} />;
}
