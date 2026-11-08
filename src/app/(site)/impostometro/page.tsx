import { PainelImpostometro } from "@/components/PainelImpostometro";
import { carregarImpostometro } from "@/lib/queries/impostometro";

// O contador anda no navegador; o servidor só entrega a base oficial.
export const metadata = {
  title: "Impostômetro",
  description:
    "Estimativa em tempo real da arrecadação de tributos no Brasil em 2026, federal e estadual, com dados oficiais da Receita Federal e do Tesouro (Siconfi).",
};

export const revalidate = 86400;

const PASSOS = [
  {
    n: "01",
    titulo: "Dados oficiais",
    texto:
      "Federal: arrecadação mensal da Receita Federal (relatório “Análise da Arrecadação das Receitas Federais”), por tributo, em valor bruto. Estadual: impostos e taxas dos 26 estados e do DF no Relatório Resumido da Execução Orçamentária (RREO) do Tesouro Nacional, que é bimestral (cada bimestre é dividido em dois meses iguais) e vem líquido de repasses. O detalhe bruto por imposto (ICMS, IPVA, ITCMD) vem da Declaração de Contas Anuais (DCA) do Tesouro, que é anual. Tudo importado automaticamente.",
  },
  {
    n: "02",
    titulo: "Projeção do período sem dado oficial",
    texto:
      "Meses ainda não divulgados usam o mesmo mês do ano anterior, multiplicado pelo crescimento médio de cada tributo no ano até aqui.",
  },
  {
    n: "03",
    titulo: "Contador em tempo real (projeção)",
    texto:
      "O contador é a base oficial mais a taxa por segundo do mês corrente vezes o tempo decorrido, recalculado no navegador. É uma projeção: nenhuma fonte pública informa a arrecadação do instante. Os números do bloco “Dados oficiais” não usam projeção.",
  },
];

export default async function Page() {
  const completo = await carregarImpostometro();
  const dados = completo.projecao.federal;
  return (
    <>
      <h1>Impostômetro</h1>
      <p className="lead">
        Quanto o Brasil arrecada em impostos, taxas e contribuições em {dados?.ano ?? "2026"}. O contador é uma
        projeção; abaixo estão os números oficiais publicados pela Receita Federal e pelo Tesouro Nacional.
      </p>
      {dados ? (
        <PainelImpostometro completo={completo} />
      ) : (
        <div className="card">Ainda não há dados de arrecadação carregados.</div>
      )}

      <details className="secao-fechavel metodologia">
        <summary>Como o valor é calculado e de onde vêm os dados</summary>
        <div className="secao-corpo">
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
          Estadual: impostos e taxas (receita realizada) dos estados e do DF. <strong>Bruto e líquido:</strong> o Federal é
          bruto. O Estadual do bloco “Dados oficiais” (RREO) é líquido dos repasses constitucionais aos municípios e do
          FUNDEB, e cada estado contabiliza essas deduções de um jeito; o bruto está no bloco “Estadual por imposto”
          (DCA, anual). Por isso o Total soma um Federal bruto com um Estadual líquido, e subestima o total arrecadado
          pelos estados. O Total também não ajusta eventual sobreposição entre as esferas. Os dados estaduais saem com mais atraso que os federais, então o Total
          usa só o período que as duas esferas já divulgaram e projeta o restante. Não inclui tributos municipais
          (ISS, IPTU etc.): o Tesouro Nacional publica esses dados de forma incompleta, e um total parcial poderia ser
          confundido com o total do país. A variação real (IPCA) existe só para a esfera federal, calculada pela própria Receita.
          População: estimativa do IBGE.
        </p>
        </div>
      </details>
    </>
  );
}
