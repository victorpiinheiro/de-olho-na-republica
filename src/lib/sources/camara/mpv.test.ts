import { describe, expect, it } from "vitest";
import { ehCreditoExtraordinario, extrairVigencia } from "./adapter";

// Despachos copiados da API real (MPV 1399/2026, 1385/2026 e 1370/2026).
const abertura = (despacho: string) => ({ dataHora: "2026-11-04T00:00", descricaoTramitacao: "Abertura de Prazo", despacho });
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

describe("extrairVigencia", () => {
  it("lê início e fim da abertura de prazo (ainda não prorrogada)", () => {
    const v = extrairVigencia([
      abertura(
        "Prazo para Emendas: 04/11/2026 a 10/11/2026.Sobrestar Pauta: a partir de 19/12/2026.Congresso Nacional: 04/11/2026 a 12/02/2027.Prorrogação pelo Congresso Nacional: Prazo ainda não prorrogado (art. 62, §7° da Constituição Federal).",
      ),
    ]);
    expect(iso(v?.inicio)).toBe("2026-11-04");
    expect(iso(v?.fim)).toBe("2027-02-12");
    expect(v?.prorrogada).toBe(false);
  });

  it("a data final vem da tramitação de prorrogação, não da previsão do texto de abertura", () => {
    const v = extrairVigencia([
      abertura("Congresso Nacional: 13/08/2026 a 11/10/2026.Prorrogação pelo Congresso Nacional: 10/12/2026."),
      {
        dataHora: "2026-10-08T00:00",
        descricaoTramitacao: "Prorrogação de Prazo",
        despacho: "Prorrogação do prazo para Deliberação da Medida Provisória por 60 dias. Data final após prorrogação: 10/12/2026. Motivação: ATO ...",
      },
    ]);
    expect(iso(v?.fim)).toBe("2026-12-10");
    expect(v?.prorrogada).toBe(true);
  });

  it("só a previsão da abertura, sem a prorrogação de fato, não conta como prorrogada", () => {
    const v = extrairVigencia([abertura("Congresso Nacional: 02/02/2026 a 02/04/2026.Prorrogação pelo Congresso Nacional: 01/06/2026.")]);
    expect(iso(v?.fim)).toBe("2026-04-02");
    expect(v?.prorrogada).toBe(false);
  });

  it("sem abertura de prazo devolve nulo (e não chuta)", () => {
    expect(extrairVigencia([{ dataHora: "2026-11-04T00:00", descricaoTramitacao: "Apresentação de Proposição", despacho: "Publicação da Medida Provisória no Diário Oficial da União." }])).toBeNull();
  });
});

describe("ehCreditoExtraordinario", () => {
  it("reconhece a ementa de abertura de crédito", () => {
    expect(ehCreditoExtraordinario("Abre crédito extraordinário, em favor do Ministério de Minas e Energia, no valor de R$ 7.520.000.000,00, para o fim que especifica.")).toBe(true);
  });
  it("não confunde com MPV que mexe em tributo", () => {
    expect(ehCreditoExtraordinario("Estabelece alíquotas e normas complementares aplicáveis ao Imposto Seletivo para o ano-calendário de 2027")).toBe(false);
  });
});
