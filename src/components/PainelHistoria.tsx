"use client";

import { useEffect, useRef, useState } from "react";
import { Kpi } from "@/components/Kpi";
import { duracaoTexto, PERIODOS, partidoTexto } from "@/lib/historia";
import type { PresidenteDto } from "@/lib/queries/historia";

const nomePeriodo = (id: string) => PERIODOS.find((p) => p.id === id)?.nome ?? id;
const ano = (iso: string) => iso.slice(0, 4);
const intervalo = (m: { inicio: string; fim: string | null }) =>
  m.fim && ano(m.fim) === ano(m.inicio) ? ano(m.inicio) : `${ano(m.inicio)}–${m.fim ? ano(m.fim) : "atual"}`;

export function PainelHistoria({ presidentes, hoje }: { presidentes: PresidenteDto[]; hoje: string }) {
  const atual = presidentes.find((p) => p.emExercicio) ?? presidentes[presidentes.length - 1];
  const [selId, setSelId] = useState(atual.id);
  const itemRef = useRef<HTMLButtonElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  const indice = presidentes.findIndex((p) => p.id === selId);
  const p = presidentes[indice];

  // Mantém o item escolhido visível na lista rolando só a lista (scrollIntoView rolaria a página inteira).
  useEffect(() => {
    const lista = listaRef.current;
    const item = itemRef.current;
    if (!lista || !item) return;
    if (item.offsetTop < lista.scrollTop) lista.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > lista.scrollTop + lista.clientHeight) {
      lista.scrollTop = item.offsetTop + item.offsetHeight - lista.clientHeight;
    }
  }, [selId]);

  const t0 = Date.parse(`${PERIODOS[0].inicio}T00:00:00Z`);
  const t1 = Date.parse(`${hoje}T00:00:00Z`);
  const pos = (iso: string) => ((Date.parse(`${iso}T00:00:00Z`) - t0) / (t1 - t0)) * 100;
  const marcas = Array.from({ length: 7 }, (_, i) => 1890 + i * 20);

  const periodosDele = [...new Set(p.mandatos.map((m) => m.periodoId))].map(nomePeriodo);
  const emCurso = p.mandatos.find((m) => m.fim === null);
  const partidoUnico = p.partidos.length === 1;

  return (
    <div className="historia">
      <section className="card historia-linha" aria-labelledby="titulo-linha">
        <div className="grafico-topo">
          <h2 id="titulo-linha">Linha do tempo · 1889–{ano(hoje)}</h2>
          <ul className="placar-legenda">
            {PERIODOS.map((pe) => (
              <li key={pe.id}><i className={`chip periodo-${pe.id}`} /> {pe.nome}</li>
            ))}
          </ul>
        </div>

        <div className="linha-periodos" aria-hidden="true">
          {PERIODOS.map((pe) => (
            <span key={pe.id} style={{ left: `${pos(pe.inicio)}%` }}>{pe.nome}</span>
          ))}
        </div>
        <div className="linha-faixa">
          {presidentes.flatMap((pr) =>
            pr.mandatos.map((m) => (
              <button
                key={`${pr.id}-${m.inicio}`}
                type="button"
                tabIndex={-1}
                className={`linha-bloco periodo-${m.periodoId}${pr.id === selId ? " linha-bloco-sel" : ""}`}
                style={{ left: `${pos(m.inicio)}%`, width: `max(3px, ${pos(m.fim ?? hoje) - pos(m.inicio)}%)` }}
                aria-label={`${pr.nome}, ${intervalo(m)}`}
                title={`${pr.nome} · ${intervalo(m)}`}
                onClick={() => setSelId(pr.id)}
              />
            )),
          )}
        </div>
        <div className="linha-eixo" aria-hidden="true">
          {marcas.map((a) => (
            <span key={a} style={{ left: `${pos(`${a}-01-01`)}%` }}>{a}</span>
          ))}
        </div>
        <p className="linha-sel">
          <i className={`chip periodo-${p.mandatos[0].periodoId}`} /> <strong>{p.nome}</strong>{" "}
          <span>{p.mandatos.map(intervalo).join(" · ")}</span>
        </p>
      </section>

      <div className="historia-corpo">
        <section className="card historia-cartao" aria-labelledby="titulo-presidente" aria-live="polite">
          <div className="cartao-topo">
            <span className="avatar" aria-hidden="true">{p.iniciais}</span>
            <div className="cartao-nome">
              <h2 id="titulo-presidente">{p.nome}</h2>
              <p>{p.mandatos.map(intervalo).join(" · ")} · {periodosDele.join(" / ")}</p>
            </div>
            <div className="cartao-nav">
              <button type="button" className="botao-icone" aria-label="Presidente anterior" disabled={indice === 0} onClick={() => setSelId(presidentes[indice - 1].id)}>‹</button>
              <button type="button" className="botao-icone" aria-label="Próximo presidente" disabled={indice === presidentes.length - 1} onClick={() => setSelId(presidentes[indice + 1].id)}>›</button>
            </div>
          </div>

          <div className="kpis kpis-3">
            <Kpi
              rotulo="Duração"
              valor={emCurso ? "Em exercício" : duracaoTexto(p.diasEncerrados)}
              nota={emCurso ? `desde ${ano(emCurso.inicio)}${p.diasEncerrados > 0 ? ` · ${duracaoTexto(p.diasEncerrados)} em períodos anteriores` : ""}` : p.mandatos.length > 1 ? `somando ${p.mandatos.length} períodos` : undefined}
            />
            <Kpi rotulo="Períodos no cargo" valor={String(p.mandatos.length)} />
            {p.partidos.length > 0 && (
              <Kpi
                rotulo={partidoUnico ? "Partido" : "Filiações ao longo da vida"}
                valor={partidoUnico ? partidoTexto(p.partidos[0]) : `${p.partidos.length} partidos`}
                nota={partidoUnico ? undefined : p.partidos.map(partidoTexto).join(", ")}
              />
            )}
          </div>

          <div className="historia-fontes">
            <h3>Fontes</h3>
            <p>
              Nome, datas de início e fim de cada período no cargo e filiações: Wikidata (carga única). O Wikidata não
              informa o partido de cada mandato, por isso, quando há mais de uma filiação, a tela lista todas.
            </p>
          </div>
        </section>

        <aside className="card historia-lista" aria-labelledby="titulo-lista">
          <div className="lista-topo">
            <h2 id="titulo-lista">Presidentes</h2>
            <span>{presidentes.length} presidentes</span>
          </div>
          <div className="lista-rolagem" ref={listaRef}>
            {PERIODOS.map((pe) => {
              const doPeriodo = presidentes.filter((pr) => pr.periodoId === pe.id);
              if (doPeriodo.length === 0) return null;
              return (
                <div key={pe.id}>
                  <p className="lista-periodo"><i className={`chip periodo-${pe.id}`} /> {pe.nome}</p>
                  <ul>
                    {doPeriodo.map((pr) => (
                      <li key={pr.id}>
                        <button
                          type="button"
                          ref={pr.id === selId ? itemRef : undefined}
                          className={`lista-item${pr.id === selId ? " lista-item-sel" : ""}`}
                          aria-pressed={pr.id === selId}
                          onClick={() => setSelId(pr.id)}
                        >
                          <span>{pr.nome}</span>
                          <span className="lista-anos">{pr.mandatos.map(intervalo).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="nota-grafico">
            As juntas governativas de 1930 e de 1969 não são pessoas no Wikidata e não aparecem na lista.
          </p>
        </aside>
      </div>
    </div>
  );
}
