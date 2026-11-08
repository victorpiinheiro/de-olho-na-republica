import { PaginaParlamentares } from "@/components/PaginaParlamentares";

export const metadata = {
  title: "Senadores",
  description:
    "Senadores: gastos da verba indenizatória (CEAPS) e presença em votações, com dados oficiais do Senado.",
};

export const revalidate = 86400;

export default function Page() {
  return <PaginaParlamentares casa="SENADO" />;
}
