import { describe, expect, it } from "vitest";
import {
  classificarVotosSenado,
  hashDespesaCeaps,
  normaGerada,
  normalizarNome,
  SEM_CATEGORIA,
  SEM_PARTIDO,
  toAutoresSenado,
  toDespesaCeaps,
  toParlamentarSenador,
  toProposicaoSenado,
  toVotacaoSenado,
  ufDoSenador,
  viraNormaJuridica,
} from "./adapter";
import {
  despesaCeapsSchema,
  materiaSchema,
  processoSchema,
  senadorSchema,
  votacaoSenadoSchema,
} from "./schemas";

const senador = (extra: object = {}, identificacao: object = {}) =>
  senadorSchema.parse({
    IdentificacaoParlamentar: {
      CodigoParlamentar: "5672",
      NomeParlamentar: "Alan Rick",
      NomeCompletoParlamentar: "Alan Rick Miranda",
      UrlFotoParlamentar: "http://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg",
      EmailParlamentar: "sen.alanrick@senado.leg.br",
      SiglaPartidoParlamentar: "REPUBLICANOS",
      UfParlamentar: "AC",
      ...identificacao,
    },
    ...extra,
  });

describe("toParlamentarSenador", () => {
  it("converte o senador e força https na foto", () => {
    expect(toParlamentarSenador(senador(), true, 57)).toEqual({
      casa: "SENADO",
      idOrigem: "5672",
      nome: "Alan Rick",
      nomeCivil: "Alan Rick Miranda",
      partido: "REPUBLICANOS",
      uf: "AC",
      fotoUrl: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador5672.jpg",
      email: "sen.alanrick@senado.leg.br",
      legislatura: 57,
      ativo: true,
    });
  });

  it("sem partido na fonte grava o rótulo honesto, sem inventar sigla", () => {
    const s = senador({}, { SiglaPartidoParlamentar: undefined });
    expect(toParlamentarSenador(s, false, 57).partido).toBe(SEM_PARTIDO);
  });

  it("pega a UF dos mandatos quando a identificação não traz (lista da legislatura)", () => {
    const um = senador({ Mandatos: { Mandato: { UfParlamentar: "AP" } } }, { UfParlamentar: undefined });
    const varios = senador(
      { Mandatos: { Mandato: [{ UfParlamentar: null }, { UfParlamentar: "PA" }] } },
      { UfParlamentar: undefined },
    );
    expect(ufDoSenador(um)).toBe("AP");
    expect(ufDoSenador(varios)).toBe("PA");
  });

  it("sem UF em lugar nenhum quebra", () => {
    expect(() => ufDoSenador(senador({}, { UfParlamentar: undefined }))).toThrow(/sem UF/);
  });
});

const despesa = (extra: object = {}) =>
  despesaCeapsSchema.parse({
    id: 2279778,
    tipoDocumento: "Nota Fiscal Eletrônica",
    ano: 2026,
    mes: 1,
    codSenador: 5672,
    nomeSenador: "ALAN RICK",
    tipoDespesa: "Aluguel de imóveis para escritório político",
    cpfCnpj: "66.970.229/0132-26",
    fornecedor: "CLARO NXT TELECOMUNICAÇÕES S.A",
    documento: "946049",
    data: "2026-01-20",
    detalhamento: null,
    valorReembolsado: 462.18,
    ...extra,
  });

describe("toDespesaCeaps", () => {
  it("converte a despesa usando o código do senador e a competência da API", () => {
    expect(toDespesaCeaps(despesa())).toMatchObject({
      idOrigemSenador: "5672",
      ano: 2026,
      mes: 1,
      fornecedor: "CLARO NXT TELECOMUNICAÇÕES S.A",
      valor: "462.18",
      urlDocumento: null,
    });
    expect(toDespesaCeaps(despesa()).dataDocumento.toISOString()).toBe("2026-01-20T00:00:00.000Z");
  });

  it("usa a competência mesmo quando a data do documento é de outro ano", () => {
    const r = toDespesaCeaps(despesa({ data: "2025-12-22", ano: 2026, mes: 1 }));
    expect(r).toMatchObject({ ano: 2026, mes: 1 });
  });

  it("recibo sem tipoDespesa vira categoria não informada", () => {
    expect(toDespesaCeaps(despesa({ tipoDespesa: null })).tipo).toBe(SEM_CATEGORIA);
  });

  it("mantém estorno (valor negativo) e arredonda a 2 casas", () => {
    expect(toDespesaCeaps(despesa({ valorReembolsado: -1570.8 })).valor).toBe("-1570.80");
  });

  it("o hash é estável e vem só do id (idempotência)", () => {
    expect(hashDespesaCeaps(1)).toBe(hashDespesaCeaps(1));
    expect(hashDespesaCeaps(1)).not.toBe(hashDespesaCeaps(2));
    expect(toDespesaCeaps(despesa()).hash).toBe(toDespesaCeaps(despesa({ fornecedor: "OUTRO" })).hash);
  });

  it("o schema quebra se um campo some ou a data muda de formato", () => {
    expect(() => despesa({ codSenador: undefined })).toThrow();
    expect(() => despesa({ data: "20/01/2026" })).toThrow();
  });
});

const voto = (codigo: number, sigla: string, partido = "PT") => ({
  codigoParlamentar: codigo,
  siglaPartidoParlamentar: partido,
  siglaVotoParlamentar: sigla,
});

const votacao = (votos: ReturnType<typeof voto>[], extra: object = {}) =>
  votacaoSenadoSchema.parse({
    codigoSessaoVotacao: 7106,
    idProcesso: 9056435,
    sigla: "PEC",
    dataSessao: "2026-10-14",
    descricaoVotacao: "Votação nominal da PEC nº 221, de 2019, em primeiro turno.",
    resultadoVotacao: "A",
    votacaoSecreta: "N",
    votos,
    ...extra,
  });

describe("classificarVotosSenado", () => {
  it("converte votos e ausências, distinguindo presente sem voto de ausente", () => {
    const r = classificarVotosSenado(
      votacao([
        voto(1, "Sim"),
        voto(2, "Não"),
        voto(3, "Abstenção"),
        voto(4, "Presidente (art. 51 RISF)"),
        voto(5, "P-NRV"),
        ...["AP", "LS", "MIS", "LP", "NCom", "LAP"].map((s, i) => voto(10 + i, s)),
      ]),
    );
    expect(r.tipo).toBe("nominal");
    expect(r.votos.slice(0, 5).map((v) => v.voto)).toEqual([
      "SIM",
      "NAO",
      "ABSTENCAO",
      "PRESIDENTE",
      "PRESENTE_SEM_VOTO",
    ]);
    expect(r.votos.slice(5).every((v) => v.voto === "AUSENTE")).toBe(true);
    expect(r.votos[0]).toEqual({ idOrigemSenador: "1", partido: "PT", voto: "SIM" });
  });

  it('descarta "NA" (dispositivo não citado), que não é voto nem ausência', () => {
    const r = classificarVotosSenado(votacao([voto(1, "Sim"), voto(2, "NA")]));
    expect(r.votos.map((v) => v.idOrigemSenador)).toEqual(["1"]);
  });

  it("votação secreta não guarda votos, mesmo com ausências e o presidente", () => {
    const r = classificarVotosSenado(
      votacao([voto(1, "Votou"), voto(2, "P-NRV"), voto(3, "Presidente (art. 51 RISF)")], {
        votacaoSecreta: "S",
      }),
    );
    expect(r).toEqual({ tipo: "secreta", votos: [] });
  });

  it("secreta com Sim/Não/Abstenção, ou nominal com Votou, quebra em vez de gravar errado", () => {
    expect(() => classificarVotosSenado(votacao([voto(1, "Sim")], { votacaoSecreta: "S" }))).toThrow(/revelados/);
    expect(() => classificarVotosSenado(votacao([voto(1, "Votou")]))).toThrow(/Votou/);
  });

  it("sigla de voto desconhecida quebra o schema", () => {
    expect(() => votacao([voto(1, "XYZ")])).toThrow();
  });
});

describe("toVotacaoSenado", () => {
  it("calcula o placar dos votos e usa o resultado oficial", () => {
    const v = votacao([voto(1, "Sim"), voto(2, "Sim"), voto(3, "Não"), voto(4, "Abstenção"), voto(5, "AP")]);
    const r = toVotacaoSenado(v, classificarVotosSenado(v));
    expect(r).toMatchObject({
      casa: "SENADO",
      idOrigem: "7106",
      aprovada: true,
      simbolica: false,
      secreta: false,
      votosSim: 2,
      votosNao: 1,
      votosAbstencao: 1,
    });
    expect(r.data.toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });

  it("rejeitada pelo resultado oficial, mesmo que Sim > Não (quórum especial)", () => {
    const v = votacao([voto(1, "Sim"), voto(2, "Sim"), voto(3, "Não")], { resultadoVotacao: "R" });
    expect(toVotacaoSenado(v, classificarVotosSenado(v)).aprovada).toBe(false);
  });

  it("secreta tem placar zerado e estado próprio", () => {
    const v = votacao([voto(1, "Votou")], { votacaoSecreta: "S" });
    expect(toVotacaoSenado(v, classificarVotosSenado(v))).toMatchObject({
      secreta: true,
      votosSim: 0,
      votosNao: 0,
    });
  });
});

const processo = (extra: object = {}) =>
  processoSchema.parse({
    id: 9056435,
    codigoMateria: 174386,
    identificacao: "PEC 221/2019",
    sigla: "PEC",
    numero: 221,
    ano: 2019,
    apelido: "Fim da escala 6x1",
    conteudo: { ementa: " Altera o art. 7º da Constituição Federal. " },
    documento: {
      dataApresentacao: "2026-05-28",
      url: "https://legis.senado.gov.br/doc",
      autoria: [{ autor: "Câmara dos Deputados", siglaTipo: "CAMARA", descricaoTipo: "CAMARA" }],
    },
    situacaoAtual: "TRANSFORMADA EM NORMA JURÍDICA",
    siglaSituacaoAtual: "TNJR",
    autoriaIniciativa: [{ autor: "Reginaldo Lopes", siglaTipo: "DEPUTADO", descricaoTipo: "DEPUTADO" }],
    ...extra,
  });

describe("toProposicaoSenado", () => {
  it("converte e marca virouLei só pela situação TNJR", () => {
    expect(toProposicaoSenado(processo(), "Emenda Constitucional 141/2026")).toMatchObject({
      casa: "SENADO",
      idOrigem: "9056435",
      siglaTipo: "PEC",
      numero: 221,
      ano: 2019,
      ementa: "Altera o art. 7º da Constituição Federal.",
      situacao: "Transformada em norma jurídica",
      virouLei: true,
      normaJuridica: "Emenda Constitucional 141/2026",
    });
    const tramitando = processo({ situacaoAtual: "AGUARDANDO DESIGNAÇÃO DO RELATOR", siglaSituacaoAtual: "ADR" });
    expect(toProposicaoSenado(tramitando, null)).toMatchObject({ virouLei: false, normaJuridica: null });
  });

  it("dataLei vem da assinatura da norma, só quando virou lei", () => {
    const lei = processo({ normaGerada: { dataAssinatura: "2023-06-14" } });
    expect(toProposicaoSenado(lei, "Lei 14597/2023").dataLei?.toISOString()).toBe("2023-06-14T00:00:00.000Z");
    expect(toProposicaoSenado(processo(), "Lei 1/2023").dataLei).toBeNull();
    const tramitando = processo({ siglaSituacaoAtual: "ADR", normaGerada: { dataAssinatura: "2023-06-14" } });
    expect(toProposicaoSenado(tramitando, null).dataLei).toBeNull();
  });

  it("lei com veto parcial (TNJRVETO) é lei; veto total (VTDA) não é", () => {
    const vetoParcial = processo({
      situacaoAtual: "TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL",
      siglaSituacaoAtual: "TNJRVETO",
    });
    const vetada = processo({ situacaoAtual: "VETADA", siglaSituacaoAtual: "VTDA" });
    expect(toProposicaoSenado(vetoParcial, "Lei Ordinária 14.600/2023").virouLei).toBe(true);
    expect(toProposicaoSenado(vetada, null).virouLei).toBe(false);
    expect(viraNormaJuridica(undefined)).toBe(false);
  });

  it("aceita ementa e situação nulas sem inventar texto", () => {
    const p = processo({ conteudo: {}, situacaoAtual: null, siglaSituacaoAtual: null });
    expect(toProposicaoSenado(p, null)).toMatchObject({ ementa: "", situacao: null, virouLei: false });
  });
});

describe("normaGerada", () => {
  const materia = (norma: unknown) =>
    materiaSchema.parse({ DetalheMateria: { Materia: { NormaGerada: norma } } });
  const id = { DescricaoTipoNorma: "Emenda Constitucional Numerada", NumeroNorma: "141", AnoNorma: "2026" };

  it("monta tipo, número e ano sem o sufixo Numerada", () => {
    expect(normaGerada(materia({ IdentificacaoNorma: id }))).toBe("Emenda Constitucional 141/2026");
  });
  it("com mais de uma norma usa a primeira", () => {
    const lei = { DescricaoTipoNorma: "Lei Ordinária", NumeroNorma: "15468", AnoNorma: "2026" };
    expect(normaGerada(materia({ IdentificacaoNorma: [lei, id] }))).toBe("Lei Ordinária 15468/2026");
  });
  it("sem norma gerada devolve nulo", () => {
    expect(normaGerada(materia(null))).toBeNull();
    expect(normaGerada(materia(undefined))).toBeNull();
  });
});

describe("toAutoresSenado", () => {
  const ids = new Map([[normalizarNome("José Aníbal"), 77]]);

  it("prefere a iniciativa (quem apresentou) à autoria do documento", () => {
    const r = toAutoresSenado(processo(), ids);
    expect(r).toEqual([{ nome: "Reginaldo Lopes", tipo: "Deputado(a)", ordem: 0, parlamentarId: null }]);
  });

  it("liga só senadores cujo nome bate, ignorando acento e caixa", () => {
    const p = processo({
      autoriaIniciativa: [
        { autor: "JOSE ANIBAL", siglaTipo: "SENADOR" },
        { autor: "Fulano Desconhecido", siglaTipo: "SENADOR" },
        { autor: "José Aníbal", siglaTipo: "DEPUTADO" },
      ],
    });
    const r = toAutoresSenado(p, ids);
    expect(r.map((a) => a.parlamentarId)).toEqual([77, null, null]);
  });

  it("sem iniciativa, usa a autoria do documento e o tipo descrito", () => {
    const p = processo({ autoriaIniciativa: [] });
    expect(toAutoresSenado(p, ids)).toEqual([
      { nome: "Câmara dos Deputados", tipo: "CAMARA", ordem: 0, parlamentarId: null },
    ]);
  });
});
