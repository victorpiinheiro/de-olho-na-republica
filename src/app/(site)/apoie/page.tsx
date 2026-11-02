import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopiarPix } from "@/components/CopiarPix";
import { carregarApoie } from "@/lib/apoie";

// Gerada uma vez no build: o Pix vem das variáveis de ambiente (ver lib/apoie.ts). Sem Pix configurado, a página não existe.
export const revalidate = false;

export const metadata = { title: "Apoie o projeto" };

export default async function Page() {
  const apoie = carregarApoie();
  if (!apoie) notFound();
  const { pix, autor } = apoie;
  // QR gerado no servidor, como imagem vetorial: não pesa no navegador e não depende de JavaScript.
  const qr = await QRCode.toString(pix.payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 });

  return (
    <>
      <h1>Apoie o projeto</h1>
      <p className="lead">
        Este site é feito e mantido por {autor}. A doação é voluntária, vai direto para mim, ajuda a manter e a melhorar o
        site e o meu trabalho nele, e não dá acesso nem influência sobre os dados.
      </p>

      <section className="card apoie" aria-labelledby="titulo-pix">
        <div className="apoie-qr" role="img" aria-label="QR code do Pix para doação" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="apoie-dados">
          <h2 id="titulo-pix">Doar por Pix</h2>
          <p>
            No aplicativo do seu banco, escolha <strong>Pix</strong> e <strong>Ler QR code</strong>. Você informa o valor que
            quiser. Pelo computador, use o código “copia e cola”.
          </p>
          <CopiarPix texto={pix.payload} />
          <dl className="apoie-quem">
            <div><dt>Quem recebe</dt><dd>{pix.nome}</dd></div>
            <div><dt>Cidade</dt><dd>{pix.cidade}</dd></div>
            <div><dt>Chave Pix (aleatória)</dt><dd>{pix.chave}</dd></div>
          </dl>
        </div>
      </section>

      <section className="card metodologia-nota-apoie">
        <h2>Antes de pagar</h2>
        <ul className="apoie-lista">
          <li>Confira, na tela de confirmação do seu banco, se o nome do recebedor é o de {autor}.</li>
          <li>A doação não dá nenhuma contrapartida: nem acesso, nem destaque, nem influência sobre o que o site mostra.</li>
          <li>Os dados do site vêm de fontes oficiais e são os mesmos para todos, doe ou não.</li>
          <li>Só esta página pede dinheiro, e só por Pix. Desconfie de qualquer outro pedido em nome do projeto.</li>
        </ul>
      </section>
    </>
  );
}
