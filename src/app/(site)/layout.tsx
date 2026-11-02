import { Sidebar } from "@/components/Sidebar";
import { carregarApoie } from "@/lib/apoie";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar mostrarApoie={carregarApoie() !== null} />
      <main className="main">{children}</main>
    </div>
  );
}
