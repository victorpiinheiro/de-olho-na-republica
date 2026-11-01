import { describe, expect, it } from "vitest";
import { paraCsv } from "./csv";
import { brlCompacto, brlGrande, brlInteiro, documentoFornecedor, milhoes, pct, pctFatia, dataBrDia, pontos, rotuloCategoria } from "./format";
import { nomeUf } from "./ufs";

// toLocaleString usa espaço não separável entre "R$" e o número.
const norm = (s: string) => s.replace(/ /g, " ");

describe("brlCompacto", () => {
  it("abrevia milhões e milhares", () => {
    expect(norm(brlCompacto(142_600_000))).toBe("R$ 142,6 mi");
    expect(norm(brlCompacto(139_176_714.36))).toBe("R$ 139,2 mi");
    expect(norm(brlCompacto(41_200))).toBe("R$ 41,2 mil");
  });
  it("valores pequenos saem inteiros", () => {
    expect(norm(brlCompacto(980))).toBe("R$ 980");
  });
});

describe("brlInteiro", () => {
  it("sem centavos, com separador de milhar", () => {
    expect(norm(brlInteiro(412_880.4))).toBe("R$ 412.880");
  });
});

describe("rotuloCategoria", () => {
  it("normaliza a caixa alta da origem e tira o ponto final", () => {
    expect(rotuloCategoria("DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.")).toBe("Divulgação da atividade parlamentar");
    expect(rotuloCategoria("HOSPEDAGEM ,EXCETO DO PARLAMENTAR NO DISTRITO FEDERAL.")).toBe(
      "Hospedagem, exceto do parlamentar no distrito federal",
    );
  });
});

describe("nomeUf", () => {
  it("traduz a sigla e devolve a própria sigla se desconhecida", () => {
    expect(nomeUf("SP")).toBe("São Paulo");
    expect(nomeUf("ZZ")).toBe("ZZ");
  });
});

describe("paraCsv", () => {
  it("usa ; e BOM, e escapa aspas e quebras", () => {
    const csv = paraCsv(["a", "b"], [["x;y", 'diz "oi"'], [1, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('"a";"b"\r\n"x;y";"diz ""oi"""\r\n"1";""');
  });
});

describe("documentoFornecedor", () => {
  it("esconde o placeholder zerado e documentos vazios", () => {
    expect(documentoFornecedor("000.000.000/0000-1")).toBeNull();
    expect(documentoFornecedor("")).toBeNull();
    expect(documentoFornecedor(null)).toBeNull();
  });
  it("mantém documento verdadeiro", () => {
    expect(documentoFornecedor("235.581.270/0012-6")).toBe("235.581.270/0012-6");
  });
  it("não confunde com o CNPJ real do Banco do Brasil, que começa com zeros", () => {
    expect(documentoFornecedor("00.000.000/0001-91")).toBe("00.000.000/0001-91");
  });
});

describe("formatação de eleições", () => {
  it("pct usa 1 casa e vírgula", () => expect(pct(47.0277)).toBe("47,0%"));
  it("milhoes compacta", () => {
    expect(milhoes(158745502)).toBe("158,7 mi");
    expect(milhoes(412000)).toBe("412 mil");
    expect(milhoes(980)).toBe("980");
  });
  it("pontos mostra sinal", () => {
    expect(pontos(10.14)).toBe("+10,1 p.p.");
    expect(pontos(-1.66)).toBe("−1,7 p.p.");
    expect(pontos(0.02)).toBe("0,0 p.p.");
  });
});

describe("brlGrande", () => {
  it("usa tri, bi, mi e mil", () => {
    expect(norm(brlGrande(2.25e12))).toBe("R$ 2,3 tri");
    expect(norm(brlGrande(8.54e9))).toBe("R$ 8,5 bi");
    expect(norm(brlGrande(139.2e6))).toBe("R$ 139,2 mi");
    expect(norm(brlGrande(412_000))).toBe("R$ 412 mil");
  });
});

describe("pctFatia", () => {
  it("uma casa a partir de 1%", () => expect(pctFatia(45, 100)).toBe("45,0%"));
  it("abaixo de 1% mostra até o primeiro dígito, para não parecer zero", () => {
    expect(pctFatia(0.3, 100)).toBe("0,30%");
    expect(pctFatia(0.04, 100)).toBe("0,040%");
    expect(pctFatia(0.004, 100)).toBe("0,004%");
    expect(pctFatia(0.0004, 100)).toBe("<0,001%");
  });
  it("zero de verdade continua zero, e total zero vira traço", () => {
    expect(pctFatia(0, 100)).toBe("0,0%");
    expect(pctFatia(5, 0)).toBe("—");
  });
});

describe("dataBrDia", () => {
  it("data só com dia não volta um dia no fuso de Brasília", () => {
    expect(dataBrDia("2023-06-14T00:00:00.000Z")).toBe("14/06/2023");
  });
});
