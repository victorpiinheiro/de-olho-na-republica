// Código "Pix copia e cola" (BR Code, padrão do Banco Central): campos no formato ID (2 dígitos) + tamanho (2 dígitos)
// + valor, e um CRC16 no fim. Usamos o código que o próprio banco gera e só o VALIDAMOS: um código errado levaria o
// dinheiro para o lugar errado, então um código inválido nunca vai ao ar.

// CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF), em 4 caracteres hexadecimais maiúsculos.
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

interface Campo {
  id: string;
  valor: string;
}

// Lê os campos; null se algum tamanho não bater com o texto.
function lerCampos(texto: string): Campo[] | null {
  const campos: Campo[] = [];
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tamanho = texto.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanho)) return null;
    const fim = i + 4 + Number(tamanho);
    if (fim > texto.length) return null;
    campos.push({ id, valor: texto.slice(i + 4, fim) });
    i = fim;
  }
  return campos;
}

export interface PixLido {
  payload: string; // o código inteiro, como o banco gerou
  chave: string;
  nome: string; // nome do recebedor no código (o banco abrevia para caber em 25 caracteres)
  cidade: string;
}

export type ResultadoPix = { ok: true; pix: PixLido } | { ok: false; motivo: string };

export function lerPix(entrada: string): ResultadoPix {
  const payload = entrada.trim();
  const falha = (motivo: string): ResultadoPix => ({ ok: false, motivo });

  if (payload.length < 40 || payload.length > 512) return falha("tamanho fora do esperado");
  if (!payload.startsWith("000201")) return falha("não começa como um código Pix (00 02 01)");
  if (payload.slice(-8, -4) !== "6304") return falha("sem o campo do CRC no final");
  const esperado = crc16(payload.slice(0, -4));
  if (payload.slice(-4).toUpperCase() !== esperado) return falha("CRC não confere: o código foi alterado ou copiado errado");

  const campos = lerCampos(payload);
  if (!campos) return falha("campos com tamanho inconsistente");
  const campo = (id: string) => campos.find((c) => c.id === id)?.valor;

  // 01 = "11": QR estático, reutilizável (o doador escolhe o valor). "12" é de uso único.
  if (campo("01") !== "11") return falha('não é um QR estático (campo 01 deve ser "11"): precisa aceitar qualquer valor');
  if (campo("54") !== undefined) return falha("o código já traz um valor fixo (campo 54): para doação o valor deve ser livre");
  if (campo("58") !== "BR") return falha('país diferente de "BR"');

  const conta = campo("26") ? lerCampos(campo("26")!) : null;
  if (!conta) return falha("sem os dados da conta Pix (campo 26)");
  if (conta.find((c) => c.id === "00")?.valor.toLowerCase() !== "br.gov.bcb.pix") return falha("não é um Pix (br.gov.bcb.pix)");
  const chave = conta.find((c) => c.id === "01")?.valor;
  if (!chave) return falha("sem a chave Pix");
  const nome = campo("59");
  const cidade = campo("60");
  if (!nome || !cidade) return falha("sem o nome ou a cidade do recebedor");

  return { ok: true, pix: { payload, chave, nome, cidade } };
}
