import { PaginaParlamentares } from "@/components/PaginaParlamentares";

export const metadata = {
  title: "Deputados federais",
  description:
    "Deputados federais: gastos da cota parlamentar, notas fiscais e presença em votações, com dados oficiais da Câmara.",
};

export const revalidate = 86400;

export default function Page() {
  return <PaginaParlamentares casa="CAMARA" />;
}
