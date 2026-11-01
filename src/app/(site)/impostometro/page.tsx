import { PainelImpostometro } from "@/components/PainelImpostometro";
import { carregarImpostometro } from "@/lib/queries/impostometro";

// O contador anda no navegador; o servidor só entrega a base oficial.
export const revalidate = 86400;

const PASSOS = [
  {
    n: "01",
    titulo: "Dados oficiais",
    texto:
      "Arrecadação mensal das receitas administradas pela Receita Federal, publicada no relatório “Análise da Arrecadação das Receitas Federais” e importada automaticamente.",
  },
  {
    n: "02",
    titulo: "Projeção do período aberto",
    texto:
      "Meses ainda não divulgados usam o mesmo mês do ano anterior, multiplicado pelo crescimento médio de cada tributo no ano até aqui.",
  },
  {
    n: "03",
    titulo: "Contador em tempo real",
    texto:
      "O valor exibido é a base oficial mais a taxa por segundo do mês corrente vezes o tempo decorrido, recalculado no navegador. É uma estimativa.",
  },
];

export default async function Page() {
  const dados = await carregarImpostometro();
  return (
    <>
      <h1>Impostômetro</h1>
      <p className="lead">
        Estimativa em tempo real dos tributos federais arrecadados em {dados?.ano ?? "2026"}, calculada a partir dos dados
        oficiais da Receita Federal.
      </p>
      {dados ? (
        <PainelImpostometro dados={dados} />
      ) : (
        <div className="card">Ainda não há dados de arrecadação carregados.</div>
      )}

      <section className="card metodologia" aria-labelledby="titulo-metodologia">
        <h2 id="titulo-metodologia">Como o valor é calculado</h2>
        <ol>
          {PASSOS.map((p) => (
            <li key={p.n}>
              <span className="metodologia-n">{p.n}</span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
        <p className="metodologia-nota">
          Considera as receitas administradas pela Receita Federal (impostos, contribuições e receita previdenciária).
          Não inclui tributos estaduais e municipais, que ainda não têm fonte de dados automatizada, nem as receitas
          administradas por outros órgãos. Variação real calculada pela própria Receita, a preços constantes pelo IPCA.
          População: estimativa do IBGE.
        </p>
      </section>
    </>
  );
}
