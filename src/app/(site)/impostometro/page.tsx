import { PainelImpostometro } from "@/components/PainelImpostometro";
import { carregarImpostometro } from "@/lib/queries/impostometro";

// O contador anda no navegador; o servidor só entrega a base oficial.
export const revalidate = 86400;

const PASSOS = [
  {
    n: "01",
    titulo: "Dados oficiais",
    texto:
      "Federal: arrecadação mensal da Receita Federal (relatório “Análise da Arrecadação das Receitas Federais”). Estadual: impostos e taxas dos 26 estados e do DF, no Relatório Resumido da Execução Orçamentária (RREO) do Tesouro Nacional, que é bimestral — cada bimestre é dividido em dois meses iguais. Tudo importado automaticamente.",
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
  const todas = await carregarImpostometro();
  const dados = todas.federal;
  return (
    <>
      <h1>Impostômetro</h1>
      <p className="lead">
        Estimativa em tempo real dos tributos federais e estaduais arrecadados em {dados?.ano ?? "2026"}, calculada a
        partir de dados oficiais da Receita Federal e do Tesouro Nacional.
      </p>
      {dados ? (
        <PainelImpostometro todas={todas} />
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
          Federal: receitas administradas pela Receita Federal (impostos, contribuições e receita previdenciária).
          Estadual: impostos e taxas (receita realizada) dos estados e do DF; o Total soma as duas esferas sem ajustar
          eventual sobreposição entre elas. Os dados estaduais saem com mais atraso que os federais, então o Total
          usa só o período que as duas esferas já divulgaram e projeta o restante. Tributos municipais ainda não têm
          fonte automatizada. A variação real (IPCA) existe só para a esfera federal, calculada pela própria Receita.
          População: estimativa do IBGE.
        </p>
      </section>
    </>
  );
}
