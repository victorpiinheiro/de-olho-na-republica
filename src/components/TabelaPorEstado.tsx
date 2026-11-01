import { linhasPorUf, type Cargo, type Disputa } from "@/lib/eleicoes";
import { pct } from "@/lib/format";

export function TabelaPorEstado({ disputas, cargo }: { disputas: Disputa[]; cargo: Cargo }) {
  const linhas = linhasPorUf(disputas, cargo);
  const porCandidato = cargo === "Governador";

  return (
    <section className="card tabela-card por-estado" aria-labelledby="titulo-por-estado">
      <div className="por-estado-topo">
        <div>
          <h2 id="titulo-por-estado">
            {porCandidato ? "Estados com 2º turno" : "Resultado por estado"}
          </h2>
          <p className="fora-sub">Percentual de votos válidos em cada turno.</p>
        </div>
        <ul className="placar-legenda">
          <li><i className="chip chip-sim" /> {porCandidato ? "Vencedor" : "Candidato A"}</li>
          <li><i className="chip chip-nao" /> {porCandidato ? "Adversário" : "Candidato B"}</li>
        </ul>
      </div>

      {linhas.length === 0 ? (
        <p className="nota-vazia">Nenhum estado teve 2º turno para este cargo.</p>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>UF</th>
                {porCandidato && <th>Finalistas</th>}
                <th className="num">A · 1º</th>
                <th className="num">B · 1º</th>
                <th className="num">A · 2º</th>
                <th className="num">B · 2º</th>
                <th className="col-duelo">2º turno</th>
                <th>Liderança</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.uf}>
                  <th scope="row">{l.uf}</th>
                  {porCandidato && <td>{l.a.nome} × {l.b.nome}</td>}
                  <td className="num">{pct(l.a.p1)}</td>
                  <td className="num">{pct(l.b.p1)}</td>
                  <td className="num"><b>{pct(l.a.p2)}</b></td>
                  <td className="num"><b>{pct(l.b.p2)}</b></td>
                  <td>
                    <div className="duelo duelo-mini" aria-hidden="true">
                      <div className="duelo-a" style={{ width: `${l.a.p2}%` }} />
                      <div className="duelo-b" style={{ width: `${l.b.p2}%` }} />
                    </div>
                  </td>
                  <td className={l.virada ? "virada" : undefined}>
                    {l.virada ? "Virada no 2º turno" : "Manteve o líder"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
