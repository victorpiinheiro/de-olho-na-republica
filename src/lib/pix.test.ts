import { describe, expect, it } from "vitest";
import { carregarApoie } from "./apoie";
import { crc16, lerPix } from "./pix";

// Código Pix FICTÍCIO montado aqui (chave aleatória inventada). O código real do site vem do ambiente.
const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

function montar(opcoes: { estatico?: string; chave?: string | null; gui?: string; pais?: string; valor?: string; nome?: string; cidade?: string } = {}) {
  const { estatico = "11", chave = "11111111-2222-4333-8444-555555555555", gui = "br.gov.bcb.pix", pais = "BR", valor, nome = "FULANO DE TAL", cidade = "SAO PAULO" } = opcoes;
  const conta = campo("00", gui) + (chave === null ? "" : campo("01", chave));
  const corpo =
    campo("00", "01") + campo("01", estatico) + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
    (valor ? campo("54", valor) : "") + campo("58", pais) + campo("59", nome) + campo("60", cidade) + campo("62", campo("05", "***")) + "6304";
  return corpo + crc16(corpo);
}

describe("crc16", () => {
  it("bate com o vetor de teste padrão do CRC16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("sempre devolve 4 caracteres hexadecimais maiúsculos", () => {
    expect(crc16("")).toBe("FFFF");
    expect(crc16("a")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("lerPix", () => {
  it("lê um código válido e devolve chave, nome e cidade", () => {
    const r = lerPix(montar());
    expect(r).toMatchObject({ ok: true, pix: { chave: "11111111-2222-4333-8444-555555555555", nome: "FULANO DE TAL", cidade: "SAO PAULO" } });
  });

  it("ignora espaços e quebras de linha nas pontas (como vêm de um .env)", () => {
    expect(lerPix(`  ${montar()}\n`).ok).toBe(true);
  });

  it("guarda o código exatamente como veio", () => {
    const codigo = montar();
    expect(lerPix(codigo)).toMatchObject({ ok: true, pix: { payload: codigo } });
  });

  it.each([
    ["alterado depois de gerado (CRC)", () => montar().replace("FULANO", "BELTRANO")],
    ["truncado", () => montar().slice(0, 60)],
    ["lixo", () => "isto não é um código pix, nem de longe, de jeito nenhum"],
    ["vazio", () => ""],
  ])("recusa código %s", (_nome, gerar) => {
    expect(lerPix(gerar()).ok).toBe(false);
  });

  it("recusa QR dinâmico (uso único): a doação precisa aceitar qualquer valor", () => {
    expect(lerPix(montar({ estatico: "12" }))).toMatchObject({ ok: false, motivo: expect.stringContaining("estático") });
  });

  it("recusa código com valor fixo", () => {
    expect(lerPix(montar({ valor: "10.00" }))).toMatchObject({ ok: false, motivo: expect.stringContaining("valor fixo") });
  });

  it("recusa o que não é Pix, país diferente de BR e conta sem chave", () => {
    expect(lerPix(montar({ gui: "br.com.outra" }))).toMatchObject({ ok: false });
    expect(lerPix(montar({ pais: "US" }))).toMatchObject({ ok: false });
    expect(lerPix(montar({ chave: null }))).toMatchObject({ ok: false, motivo: expect.stringContaining("chave") });
  });

  it("recusa código com campo de tamanho inconsistente, mesmo com CRC certo", () => {
    const corpo = "000201" + "0102" + "11" + "2650" + "0014br.gov.bcb.pix" + "6304";
    expect(lerPix(corpo + crc16(corpo))).toMatchObject({ ok: false });
  });
});

describe("carregarApoie", () => {
  it("sem PIX_COPIA_E_COLA a página não existe", () => {
    expect(carregarApoie({})).toBeNull();
    expect(carregarApoie({ PIX_COPIA_E_COLA: "   " })).toBeNull();
  });

  it("com código válido, devolve o Pix e usa o nome do código se não houver APOIE_AUTOR", () => {
    const a = carregarApoie({ PIX_COPIA_E_COLA: montar() });
    expect(a?.pix.nome).toBe("FULANO DE TAL");
    expect(a?.autor).toBe("FULANO DE TAL");
  });

  it("APOIE_AUTOR vira o nome do texto", () => {
    expect(carregarApoie({ PIX_COPIA_E_COLA: montar(), APOIE_AUTOR: " Fulano da Silva " })?.autor).toBe("Fulano da Silva");
  });

  it("com código inválido o build falha (nunca publica um Pix errado)", () => {
    expect(() => carregarApoie({ PIX_COPIA_E_COLA: montar().replace("FULANO", "BELTRANO") })).toThrow(/PIX_COPIA_E_COLA inválido: CRC/);
  });
});
