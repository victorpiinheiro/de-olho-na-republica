import Link from "next/link";
import { Placar } from "@/components/Placar";
import { StatusLei } from "@/components/StatusLei";
import { dataBr } from "@/lib/format";
import { NOME_CASA, rotuloResultado } from "@/lib/leis";
import type { CardLei as Card } from "@/lib/queries/leis";

export function CardLei({ lei }: { lei: Card }) {
  const d = lei.destaque;
  return (
    <article className="card lei">
      <div className="lei-topo">
        <StatusLei rotulo={lei.status.rotulo} tom={lei.status.tom} normaJuridica={lei.normaJuridica} />
        <span className="lei-codigo">{lei.codigo}</span>
        {d && (
          <span className="lei-meta">
            {NOME_CASA[lei.casa]} · {dataBr(d.dataIso)}
          </span>
        )}
      </div>

      <h3 className="lei-ementa">
        <Link href={`/leis/proposicao/${lei.id}`}>{lei.ementa}</Link>
      </h3>

      {d && (
        <p className="lei-votacao">
          Votação: {rotuloResultado(d.aprovada)} — {d.descricao}
        </p>
      )}

      <div className="lei-rodape">
        <p className="lei-autor">
          {lei.autoria && (
            <>
              Proposta por{" "}
              {lei.autoria.parlamentarId ? (
                <Link href={`/parlamentares/${lei.autoria.parlamentarId}`}>
                  <strong>{lei.autoria.texto}</strong>
                </Link>
              ) : (
                <strong>{lei.autoria.texto}</strong>
              )}
            </>
          )}
        </p>
        {d && <Placar compacto estado={d.estado} sim={d.sim} nao={d.nao} abst={d.abst} />}
      </div>
    </article>
  );
}
