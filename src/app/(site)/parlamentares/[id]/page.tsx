import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/Avatar";
import { Barra } from "@/components/Barra";
import { GraficoMensal } from "@/components/GraficoMensal";
import { Kpi } from "@/components/Kpi";
import { TabelaDespesas } from "@/components/TabelaDespesas";
import { db } from "@/lib/db";
import { brl, inteiro, rotuloCategoria } from "@/lib/format";
import { resumoLegislativo } from "@/lib/queries/leis";
import { buscarPerfil } from "@/lib/queries/parlamentares";
import { nomeUf } from "@/lib/ufs";

const PERFIL = {
  CAMARA: {
    cargo: "Deputado(a) federal",
    fonte: "Câmara dos Deputados",
    pagina: (id: string) => `https://www.camara.leg.br/deputados/${id}`,
    botao: "Página oficial na Câmara ↗",
  },
  SENADO: {
    cargo: "Senador(a)",
    fonte: "Senado Federal",
    pagina: (id: string) => `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${id}`,
    botao: "Página oficial no Senado ↗",
  },
} as const;

export const revalidate = 86400;

// Sem pré-render no build: cada perfil é gerado na primeira visita e depois revalidado.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const p = await db.parlamentar.findUnique({ where: { id: Number(id) }, select: { nome: true, partido: true, uf: true, casa: true } });
  if (!p) return {};
  const cargo = PERFIL[p.casa].cargo.toLowerCase();
  return {
    title: `${p.nome} (${p.partido}-${p.uf})`,
    description: `Gastos da cota parlamentar, notas fiscais, presença em votações e proposições de ${p.nome}, ${cargo} (${p.partido}-${p.uf}). Dados oficiais.`,
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const agora = new Date();
  const ano = agora.getFullYear();
  const [perfil, leg] = await Promise.all([
    buscarPerfil(Number(id), ano),
    resumoLegislativo(Number(id), ano),
  ]);
  if (!perfil) notFound();

  const { parlamentar: p, categorias, mensal, despesas } = perfil;

  const casa = PERFIL[p.casa];
  const nominais = leg.nominais[p.casa];
  const total = despesas.reduce((s, d) => s + d.valor, 0);
  const comImagem = despesas.filter((d) => d.urlDocumento).length;
  const maxCategoria = Math.max(0, ...categorias.map((c) => c.valor));
  const ateMesAtual = mensal.filter((m) => m.mes <= agora.getMonth() + 1);
  const arquivo = `despesas-${p.nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <>
      <nav className="migalhas" aria-label="Você está em">
        <Link href="/parlamentares">Parlamentares</Link> <span aria-hidden="true">/</span>{" "}
        <span>{p.nome}</span>
      </nav>

      <header className="card perfil-topo">
        <Avatar nome={p.nome} fotoUrl={p.fotoUrl} tamanho={96} />
        <div>
          <h1>{p.nome}</h1>
          <p className="lead">
            {casa.cargo} · {p.partido} · {nomeUf(p.uf)}
          </p>
          <span className="selo selo-solto">{p.ativo ? "Em exercício" : "Fora de exercício"}</span>
        </div>
        <div className="perfil-acoes">
          {leg.autorias > 0 && (
            <Link href={`/leis?autor=${p.id}`} className="btn btn-link">
              Ver leis de autoria dele(a)
            </Link>
          )}
          <a
            href={casa.pagina(p.idOrigem)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-link"
          >
            {casa.botao}
          </a>
        </div>
      </header>

      <div className="kpis kpis-4">
        <Kpi rotulo={`Cota usada em ${ano}`} valor={brl(total)} nota="limite anual da UF: sem fonte oficial ainda" />
        <Kpi
          rotulo="Notas fiscais"
          valor={inteiro(despesas.length)}
          nota={
            comImagem > 0
              ? `${inteiro(comImagem)} com imagem do documento`
              : "link do documento não disponível na fonte"
          }
        />
        <Kpi
          rotulo="Presença em votações"
          valor={nominais ? `${Math.round((leg.votou / nominais) * 100)}%` : "—"}
          nota={`${inteiro(leg.votou)} de ${inteiro(nominais)} votações nominais em ${ano}`}
        />
        <Kpi
          rotulo="Autorias votadas"
          valor={inteiro(leg.autorias)}
          nota="proposições de autoria que chegaram ao plenário"
        />
      </div>

      <div className="duas-colunas">
        <section className="card">
          <h2>Gasto por categoria</h2>
          <ul className="barras">
            {categorias.map((c) => (
              <li key={c.tipo}>
                <div className="barras-linha">
                  <span>{rotuloCategoria(c.tipo)}</span>
                  <strong>{brl(c.valor)}</strong>
                </div>
                <Barra valor={c.valor} maximo={maxCategoria} />
              </li>
            ))}
            {categorias.length === 0 && <li className="vazio">Sem despesas no ano.</li>}
          </ul>
        </section>

        <section className="card">
          <div className="barras-linha">
            <h2>Gasto por mês</h2>
            <span className="sub">R$ mil</span>
          </div>
          <GraficoMensal mensal={ateMesAtual} />
        </section>
      </div>

      <section className="card tabela-card">
        <div className="bloco-despesas">
          <TabelaDespesas despesas={despesas} ano={ano} arquivo={arquivo} fonte={casa.fonte} />
        </div>
      </section>
    </>
  );
}
