import { dataBr, dataBrDia } from "@/lib/format";
import { rotuloResultado } from "@/lib/leis";
import type { VotacaoDetalhe } from "@/lib/queries/leis";

const TEXTO_ESTADO = { nominal: "nominal", simbolica: "simbólica", secreta: "secreta" } as const;

// Só usa dados que já guardamos: apresentação, votações do plenário e situação atual.
// Não guardamos as tramitações completas (centenas de linhas por proposição).
export function LinhaDoTempo({
  apresentacaoIso,
  dataLeiIso,
  votacoes,
  situacao,
  virouLei,
  normaJuridica,
}: {
  apresentacaoIso: string | null;
  dataLeiIso: string | null;
  votacoes: VotacaoDetalhe[];
  situacao: string | null;
  virouLei: boolean;
  normaJuridica: string | null;
}) {
  return (
    <ol className="timeline">
      {apresentacaoIso && (
        <li>
          <time>{dataBrDia(apresentacaoIso)}</time>
          <span>Proposição apresentada</span>
        </li>
      )}
      {votacoes.map((x) => (
        <li key={x.id}>
          <time>{dataBr(x.dataIso)}</time>
          <span>
            <strong>{rotuloResultado(x.aprovada)}</strong> ({TEXTO_ESTADO[x.estado]}) — {x.descricao}
          </span>
        </li>
      ))}
      <li className="timeline-atual">
        <time>{virouLei ? (dataLeiIso ? dataBrDia(dataLeiIso) : "Data não informada") : "Situação atual"}</time>
        <span>
          <strong>{virouLei ? `Virou lei${normaJuridica ? ` · ${normaJuridica}` : ""}` : (situacao ?? "Em tramitação")}</strong>
        </span>
      </li>
    </ol>
  );
}
