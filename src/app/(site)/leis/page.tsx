import { ListaLeis } from "@/components/ListaLeis";

export const revalidate = 3600;

export default function Page() {
  return <ListaLeis aba="todas" />;
}
