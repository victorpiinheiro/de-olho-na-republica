import { PaginaParlamentares } from "@/components/PaginaParlamentares";

export const revalidate = 86400;

export default function Page() {
  return <PaginaParlamentares casa="CAMARA" />;
}
