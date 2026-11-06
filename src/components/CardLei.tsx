import Link from "next/link";
import { Placar } from "@/components/Placar";
import { StatusLei } from "@/components/StatusLei";
import { dataBr, dataBrDia } from "@/lib/format";
import { NOME_CASA, rotuloResultado } from "@/lib/leis";
import type { CardLei as Card } from "@/lib/queries/leis";

const NA_CASA = { CAMARA: "na Câmara", SENADO: "no Senado" } as const;

export function CardLei({ lei }: { lei: Card }) {
  const d = lei.destaque;
  return (
    <article className="card lei card-link">
      <div className="lei-topo">
        <StatusLei rotulo={lei.status.rotulo} tom={lei.status.tom} normaJuridica={lei.normaJuridica} />
        <span className="lei-codigo">{lei.codigo}</span>
        {d && (
          <span className="lei-meta">
            {NOME_CASA[lei.casa]} · {dataBr(d.dataIso)}
          </span>
        )}
      </div>

      {lei.mp && (
        <p className="lei-votacao">
          {lei.mp.creditoExtraordinario && <strong>Crédito extraordinário · </strong>}
          {lei.mp.apresentadaIso && <>Editada em {dataBrDia(lei.mp.apresentadaIso)}</>}
          {lei.mp.vigenciaFimIso && (
            <>
              {lei.mp.apresentadaIso ? " · " : ""}Prazo no Congresso até {dataBrDia(lei.mp.vigenciaFimIso)}
              {lei.mp.prorrogada ? " (prorrogado)" : ""}
            </>
          )}
        </p>
      )}

      <h3 className="lei-ementa">
        <Link href={`/leis/proposicao/${lei.id}`}>{lei.ementa}</Link>
      </h3>

      {d && (
        <p className="lei-votacao">
          Votação: {rotuloResultado(d.aprovada)} — {d.descricao}
        </p>
      )}

      {lei.tambem.length > 0 && (
        <p className="lei-tambem">
          Também votada {lei.tambem.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              {NA_CASA[t.casa]} (<Link href={`/leis/proposicao/${t.id}`}>{t.codigo === lei.codigo ? "ver votação" : t.codigo}</Link>)
            </span>
          ))}
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
        {d && (
          <div className="lei-placar">
            <Placar compacto estado={d.estado} sim={d.sim} nao={d.nao} abst={d.abst} />
            {d.estado === "nominal" && <span className="lei-ver-votos">Ver quem votou →</span>}
          </div>
        )}
      </div>
    </article>
  );
}
