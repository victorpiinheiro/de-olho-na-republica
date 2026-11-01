import Link from "next/link";
import { ABAS, type Aba } from "@/lib/leis";

export function AbasLeis({ ativa }: { ativa: Aba }) {
  return (
    <nav className="abas" aria-label="Filtro de leis">
      {ABAS.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          className="aba"
          aria-current={a.chave === ativa ? "page" : undefined}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
