import Link from "next/link";
import type { CasaLegislativa } from "@/lib/leis";
import { inteiro } from "@/lib/format";

export function AlternanciaCasa({
  ativa,
  camara,
  senado,
}: {
  ativa: CasaLegislativa;
  camara: number;
  senado: number;
}) {
  const itens = [
    { casa: "CAMARA" as const, href: "/parlamentares", rotulo: `Câmara · ${inteiro(camara)}` },
    { casa: "SENADO" as const, href: "/parlamentares/senado", rotulo: `Senado · ${inteiro(senado)}` },
  ];
  return (
    <nav className="alternancia" aria-label="Casa legislativa">
      {itens.map((i) => (
        <Link
          key={i.casa}
          href={i.href}
          className={`aba${i.casa === ativa ? " aba-ativa" : ""}`}
          aria-current={i.casa === ativa ? "page" : undefined}
        >
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}
