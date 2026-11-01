import Link from "next/link";
import { notFound } from "next/navigation";
import { LinhaDoTempo } from "@/components/LinhaDoTempo";
import { StatusLei } from "@/components/StatusLei";
import { VotosDaProposicao } from "@/components/VotosDaProposicao";
import { statusDe } from "@/lib/leis";
import { buscarLei } from "@/lib/queries/leis";

export const revalidate = 3600;

// Sem pré-render no build: cada proposição é gerada na primeira visita e depois revalidada.
export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const lei = await buscarLei(Number(id));
  if (!lei) notFound();

  const { proposicao: p, autores, votacoes, destaqueIndice } = lei;
  const status = statusDe({
    casa: p.casa,
    virouLei: p.virouLei,
    situacao: p.situacao,
    votacoes: votacoes.map((v) => ({
      data: new Date(v.dataIso),
      descricao: v.descricao,
      aprovada: v.aprovada,
      simbolica: v.estado === "simbolica",
      secreta: v.estado === "secreta",
      votosSim: v.sim,
      votosNao: v.nao,
      votosAbstencao: v.abst,
    })),
  });

  return (
    <>
      <Link href="/leis" className="voltar">← Leis e votações</Link>

      <header className="lei-cabecalho">
        <div className="lei-topo">
          <StatusLei rotulo={status.rotulo} tom={status.tom} normaJuridica={p.normaJuridica} />
        </div>
        <h1>{p.codigo}</h1>
        <p className="lead">{p.ementa}</p>
        <p className="lei-fonte">
          Ementa oficial, conforme {p.casa === "SENADO" ? "o Senado Federal" : "a Câmara dos Deputados"}.
          {p.urlInteiroTeor && (
            <>
              {" "}
              <a href={p.urlInteiroTeor} target="_blank" rel="noopener noreferrer" className="link-forte">
                Ver inteiro teor
              </a>
            </>
          )}
        </p>
      </header>

      <div className="duas-colunas">
        <section className="card">
          <h2>Autoria</h2>
          <ul className="lista-simples">
            {autores.map((a) => (
              <li key={a.nome}>
                {a.parlamentarId ? (
                  <Link href={`/parlamentares/${a.parlamentarId}`} className="link-forte">{a.nome}</Link>
                ) : (
                  a.nome
                )}
                {(a.tipo === "Deputado(a)" || a.tipo === "Senador(a)") && (
                  <span className="lei-meta"> · {a.tipo}</span>
                )}
              </li>
            ))}
            {autores.length === 0 && <li className="vazio">Autoria não informada pela fonte.</li>}
          </ul>
        </section>

        <section className="card">
          <h2>Linha do tempo</h2>
          <LinhaDoTempo
            apresentacaoIso={p.dataApresentacaoIso}
            dataLeiIso={p.dataLeiIso}
            votacoes={votacoes}
            situacao={p.situacao}
            virouLei={p.virouLei}
            normaJuridica={p.normaJuridica}
          />
        </section>
      </div>

      <section className="card">
        <h2>Votações no plenário {p.casa === "SENADO" ? "do Senado" : "da Câmara"}</h2>
        {p.casa === "SENADO" && (
          <p className="lead">
            O Senado só publica votações nominais e secretas. Em votação secreta sabemos quem participou, mas
            não como cada senador votou.
          </p>
        )}
        <VotosDaProposicao votacoes={votacoes} indiceInicial={destaqueIndice} casa={p.casa} />
      </section>
    </>
  );
}
