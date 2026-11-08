import { ListaLeis } from "@/components/ListaLeis";

export const metadata = {
  title: "Leis e votações",
  description:
    "O que foi votado nos plenários da Câmara e do Senado: quem propôs, resumo e como cada parlamentar votou.",
};

export const revalidate = 3600;

export default function Page() {
  return <ListaLeis aba="todas" />;
}
