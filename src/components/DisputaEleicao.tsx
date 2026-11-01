import { Barra } from "@/components/Barra";
import {
  finalistas,
  foraDoSegundoTurno,
  type CandidatoEleicao,
  type Disputa,
} from "@/lib/eleicoes";
import { milhoes, pct, pontos } from "@/lib/format";

export type Modo = "comparar" | "1" | "2";

const COR = ["a", "b"] as const;

function CardFinalista({
  indice,
  candidato,
  noTurno1,
  modo,
}: {
  indice: 0 | 1;
  candidato: CandidatoEleicao;
  noTurno1: CandidatoEleicao | null;
  modo: Modo;
}) {
  const cor = COR[indice];
  const mostra1 = modo !== "2" && noTurno1;
  const mostra2 = modo !== "1";
  return (
    <div className="card finalista">
      <div className="finalista-topo">
        <span className={`finalista-inicial finalista-${cor}`} aria-hidden="true">
          {candidato.nome.charAt(0)}
        </span>
        <div>
          <div className="finalista-nome">{candidato.nome}</div>
          <div className="finalista-partido">{candidato.partido}</div>
        </div>
        {candidato.eleito && modo !== "1" && <span className="selo-eleito">Eleito</span>}
      </div>

      {mostra1 && noTurno1 && (
        <div className="finalista-linha">
          <div className="finalista-linha-topo">
            <span>1º turno</span>
            <span><b>{pct(noTurno1.percentual)}</b> · {milhoes(noTurno1.votos)}</span>
          </div>
          <Barra valor={noTurno1.percentual} maximo={100} tom={`${cor}-claro`} />
        </div>
      )}
      {mostra2 && (
        <div className="finalista-linha">
          <div className="finalista-linha-topo">
            <span>2º turno</span>
            <span><b>{pct(candidato.percentual)}</b> · {milhoes(candidato.votos)}</span>
          </div>
          <Barra valor={candidato.percentual} maximo={100} tom={cor} />
        </div>
      )}

      {modo === "comparar" && noTurno1 && (
        <div className="finalista-variacao">
          <div>
            <span>Variação</span>
            <b>{pontos(candidato.percentual - noTurno1.percentual)}</b>
          </div>
          <div>
            <span>Votos ganhos entre turnos</span>
            <b>
              {candidato.votos - noTurno1.votos >= 0 ? "+" : "−"}
              {milhoes(Math.abs(candidato.votos - noTurno1.votos))}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}

// Cargo sem 2º turno (ou modo "1º turno"): lista todos os candidatos do 1º turno.
function ResultadoTurno1({ d }: { d: Disputa }) {
  return (
    <ul className="candidatos">
      {d.turno1.candidatos.map((c) => (
        <li key={c.numero}>
          <div className="candidatos-topo">
            <span>
              {c.nome} <small>{c.partido}</small>
              {c.eleito && <span className="selo-eleito">Eleito</span>}
            </span>
            <span><b>{pct(c.percentual)}</b> · {milhoes(c.votos)}</span>
          </div>
          <Barra valor={c.percentual} maximo={100} tom="neutro" />
        </li>
      ))}
    </ul>
  );
}

export function DisputaEleicao({ d, modo }: { d: Disputa; modo: Modo }) {
  const finais = finalistas(d);
  const temSegundo = finais.length > 0;
  const [a, b] = finais;
  const lista1 = !temSegundo || modo === "1";
  const titulo =
    lista1 ? `Resultado do 1º turno · ${d.cargo}` : `Disputa do 2º turno · ${d.cargo}`;

  return (
    <section className="card disputa" aria-labelledby="titulo-disputa">
      <h2 id="titulo-disputa">{titulo}</h2>
      {modo === "2" && !temSegundo && <p className="nota-vazia">Não houve 2º turno nesta disputa.</p>}
      {lista1 ? (
        <ResultadoTurno1 d={d} />
      ) : (
        <>
          <div
            className="duelo"
            role="img"
            aria-label={`${a.candidato.nome} ${pct(a.candidato.percentual)}, ${b.candidato.nome} ${pct(b.candidato.percentual)}`}
          >
            <div className="duelo-a" style={{ width: `${a.candidato.percentual}%` }} />
            <div className="duelo-b" style={{ width: `${b.candidato.percentual}%` }} />
          </div>
          <div className="duelo-legenda">
            <span>{a.candidato.nome} · {pct(a.candidato.percentual)}</span>
            <span>metade dos votos válidos</span>
            <span>{pct(b.candidato.percentual)} · {b.candidato.nome}</span>
          </div>
          <div className="finalistas">
            <CardFinalista indice={0} candidato={a.candidato} noTurno1={a.noTurno1} modo={modo} />
            <CardFinalista indice={1} candidato={b.candidato} noTurno1={b.noTurno1} modo={modo} />
          </div>
        </>
      )}
    </section>
  );
}

export function ForaDoSegundoTurno({ d }: { d: Disputa }) {
  const fora = foraDoSegundoTurno(d);
  if (fora.length === 0) return null;
  const destaque = fora.slice(0, 3);
  const resto = fora.slice(3);
  const somaResto = resto.reduce((s, c) => s + c.percentual, 0);
  const total = fora.reduce((s, c) => s + c.percentual, 0);
  return (
    <section className="card fora" aria-labelledby="titulo-fora">
      <h2 id="titulo-fora">Fora do 2º turno</h2>
      <p className="fora-sub">Votos do 1º turno que ficaram em disputa.</p>
      <ul>
        {destaque.map((c) => (
          <li key={c.numero}>
            <div>
              <div>{c.nome}</div>
              <small>{c.partido}</small>
            </div>
            <b>{pct(c.percentual)}</b>
          </li>
        ))}
        {resto.length > 0 && (
          <li>
            <div>
              <div>Outros {resto.length} candidatos</div>
              <small>diversos</small>
            </div>
            <b>{pct(somaResto)}</b>
          </li>
        )}
      </ul>
      <p className="fora-total">Total disputado: {pct(total)} dos votos válidos</p>
    </section>
  );
}
