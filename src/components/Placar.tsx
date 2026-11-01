import { inteiro } from "@/lib/format";
import { placar, type EstadoVotacao } from "@/lib/leis";

const TEXTO_ESTADO = {
  simbolica: "Votação simbólica, sem registro de votos individuais",
  secreta: "Votação secreta: sabemos quem participou, mas não como cada um votou",
} as const;

// A cor nunca é a única informação: o número de cada lado vem sempre em texto.
// `compacto`: barra fina e uma linha de texto (card da lista). Padrão: barra e legenda.
export function Placar({
  estado,
  sim,
  nao,
  abst,
  compacto = false,
}: {
  estado: EstadoVotacao;
  sim: number;
  nao: number;
  abst: number;
  compacto?: boolean;
}) {
  if (estado !== "nominal") return <p className="placar-estado">{TEXTO_ESTADO[estado]}</p>;

  const p = placar(sim, nao, abst);
  const barra = (
    <div className="placar" role="img" aria-label={`Sim ${sim}, Não ${nao}, Abstenção ${abst}`}>
      <span className="placar-sim" style={{ width: `${p.sim}%` }} />
      <span className="placar-nao" style={{ width: `${p.nao}%` }} />
      <span className="placar-abst" style={{ width: `${p.abst}%` }} />
    </div>
  );

  if (compacto) {
    return (
      <div className="placar-compacto">
        {barra}
        <span>
          {inteiro(sim)} Sim · {inteiro(nao)} Não · {inteiro(abst)} Abst.
        </span>
      </div>
    );
  }

  return (
    <div>
      {barra}
      <ul className="placar-legenda">
        <li><i className="chip chip-sim" /> Sim {inteiro(sim)}</li>
        <li><i className="chip chip-nao" /> Não {inteiro(nao)}</li>
        <li><i className="chip chip-abst" /> Abstenção {inteiro(abst)}</li>
      </ul>
    </div>
  );
}
