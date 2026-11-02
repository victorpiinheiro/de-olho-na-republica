import { lerPix, type PixLido } from "./pix";

export interface Apoie {
  pix: PixLido;
  autor: string; // nome mostrado no texto da página
}

// Configuração da página "Apoie o projeto", lida das variáveis de ambiente (o repositório é público: nada disso vai
// para o git). Sem PIX_COPIA_E_COLA a página e o link não existem. Com o código inválido o build FALHA de propósito:
// melhor nenhum site no ar do que um Pix que manda o dinheiro para o lugar errado.
export function carregarApoie(env: Record<string, string | undefined> = process.env): Apoie | null {
  const bruto = env.PIX_COPIA_E_COLA?.trim();
  if (!bruto) return null;
  const lido = lerPix(bruto);
  if (!lido.ok) throw new Error(`PIX_COPIA_E_COLA inválido: ${lido.motivo}`);
  return { pix: lido.pix, autor: env.APOIE_AUTOR?.trim() || lido.pix.nome };
}
