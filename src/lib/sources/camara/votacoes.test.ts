import { describe, expect, it } from "vitest";
import {
  classificarVotos,
  extrairNorma,
  extrairNormaJuridica,
  proposicaoPrincipal,
  toAutores,
  toOrientacoes,
  toProposicao,
  toVotacao,
} from "./adapter";
import {
  autorSchema,
  orientacaoSchema,
  proposicaoSchema,
  tramitacaoSchema,
  votacaoSchema,
  votoSchema,
} from "./schemas";

// Formas reais da API da Câmara (extras ignorados, como na resposta de verdade).
const voto = (id: number, partido: string, tipoVoto: string | null) =>
  votoSchema.parse({
    tipoVoto,
    dataRegistroVoto: "2026-10-14T19:41:40",
    deputado_: { id, nome: "X", siglaPartido: partido, siglaUf: "AL", uri: "x" },
  });

const votacao = (extra: object = {}) =>
  votacaoSchema.parse({
    id: "2635476-36",
    data: "2026-10-14",
    dataHoraRegistro: "2026-10-14T19:42:50",
    descricao: "Aprovada a Subemenda ao PLP 186/2026. Sim: 461; Não: 4; Total: 465.",
    aprovacao: 1,
    proposicoesAfetadas: [{ id: 2635476, siglaTipo: "PLP", numero: 186, ano: 2026, ementa: "x" }],
    objetosPossiveis: [{ id: 1, siglaTipo: "EMP" }],
    ...extra,
  });

describe("classificarVotos", () => {
  it("lista vazia é votação simbólica, não nominal sem votos", () => {
    expect(classificarVotos([])).toEqual({ tipo: "simbolica", votos: [] });
  });

  it("todos com tipoVoto nulo é votação secreta", () => {
    const r = classificarVotos([voto(1, "A", null), voto(2, "B", null)]);
    expect(r).toEqual({ tipo: "secreta", votos: [] });
  });

  it("converte os tipos de voto, incluindo o voto do presidente (Artigo 17)", () => {
    const r = classificarVotos([
      voto(1, "A", "Sim"),
      voto(2, "B", "Não"),
      voto(3, "C", "Abstenção"),
      voto(4, "D", "Artigo 17"),
    ]);
    expect(r.tipo).toBe("nominal");
    expect(r.votos.map((v) => v.voto)).toEqual(["SIM", "NAO", "ABSTENCAO", "PRESIDENTE"]);
    expect(r.votos[0]).toEqual({ idOrigemDeputado: "1", partido: "A", voto: "SIM" });
  });

  it("mistura de nulos e votos quebra em vez de gravar errado", () => {
    expect(() => classificarVotos([voto(1, "A", "Sim"), voto(2, "B", null)])).toThrow(/sem tipoVoto/);
  });
});

describe("votoSchema", () => {
  it("rejeita tipo de voto desconhecido", () => {
    expect(() => voto(1, "A", "Obstrução")).toThrow();
  });
});

describe("votacaoSchema", () => {
  it("rejeita aprovacao fora de 0, 1 ou nulo", () => {
    expect(() => votacao({ aprovacao: 2 })).toThrow();
    expect(votacao({ aprovacao: null }).aprovacao).toBeNull();
  });
});

describe("proposicaoPrincipal", () => {
  const p = (id: number, siglaTipo: string) => ({ id, siglaTipo, numero: 1, ano: 2026 });

  it("usa a única proposição do tipo norma", () => {
    expect(proposicaoPrincipal([p(1, "PLP")])?.id).toBe(1);
  });
  it("ignora requerimentos, emendas e pareceres", () => {
    expect(proposicaoPrincipal([p(1, "REQ"), p(2, "PL"), p(3, "EMP")])?.id).toBe(2);
  });
  it("sem norma ou com mais de uma, não escolhe", () => {
    expect(proposicaoPrincipal([p(1, "REQ")])).toBeNull();
    expect(proposicaoPrincipal([p(1, "PL"), p(2, "PEC")])).toBeNull();
    expect(proposicaoPrincipal([])).toBeNull();
  });
});

describe("toVotacao", () => {
  it("calcula o placar dos votos nominais e lê a hora como Brasília", () => {
    const c = classificarVotos([
      voto(1, "A", "Sim"),
      voto(2, "B", "Sim"),
      voto(3, "C", "Não"),
      voto(4, "D", "Abstenção"),
      voto(5, "E", "Artigo 17"),
    ]);
    const v = toVotacao(votacao(), c);
    expect(v).toMatchObject({
      idOrigem: "2635476-36",
      aprovada: true,
      simbolica: false,
      secreta: false,
      votosSim: 2,
      votosNao: 1,
      votosAbstencao: 1,
    });
    expect(v.data.toISOString()).toBe("2026-10-14T22:42:50.000Z");
  });

  it("simbólica e secreta são estados próprios, com placar zerado", () => {
    expect(toVotacao(votacao(), classificarVotos([]))).toMatchObject({ simbolica: true, secreta: false });
    const secreta = toVotacao(votacao(), classificarVotos([voto(1, "A", null)]));
    expect(secreta).toMatchObject({ simbolica: false, secreta: true, votosSim: 0, votosNao: 0 });
  });

  it("aprovacao nula vira resultado desconhecido, não rejeitado", () => {
    expect(toVotacao(votacao({ aprovacao: null }), classificarVotos([])).aprovada).toBeNull();
    expect(toVotacao(votacao({ aprovacao: 0 }), classificarVotos([])).aprovada).toBe(false);
  });
});

describe("toProposicao", () => {
  const base = {
    id: 253500,
    siglaTipo: "PL",
    numero: 2597,
    ano: 2024,
    ementa: "Dispõe sobre algo.",
    dataApresentacao: "2024-06-01T10:00",
    urlInteiroTeor: "https://camara/teor",
    statusProposicao: { codSituacao: 1140, descricaoSituacao: "Transformado em Norma Jurídica" },
  };

  it("marca virouLei só para a situação Transformado em Norma Jurídica", () => {
    expect(toProposicao(proposicaoSchema.parse(base))).toMatchObject({
      idOrigem: "253500",
      virouLei: true,
      situacao: "Transformado em Norma Jurídica",
    });
    const tramitando = {
      ...base,
      statusProposicao: { codSituacao: 1010, descricaoSituacao: "Aguardando" },
    };
    expect(toProposicao(proposicaoSchema.parse(tramitando)).virouLei).toBe(false);
  });

  it("guarda o órgão e a data da última movimentação (status atual da Câmara)", () => {
    // Valores da PEC 32/2015, copiados da API real em 08/11/2026.
    const r = toProposicao(
      proposicaoSchema.parse({
        ...base,
        statusProposicao: {
          codSituacao: 915,
          descricaoSituacao: "Aguardando Parecer",
          siglaOrgao: "PEC03215",
          dataHora: "2026-11-04T18:20",
        },
      }),
    );
    expect(r.orgaoAtual).toBe("PEC03215");
    expect(r.dataUltimaTramitacao?.toISOString().slice(0, 10)).toBe("2026-11-04");
  });

  it("sem órgão e sem data (a API omite) ficam nulos, e não quebram a validação", () => {
    const r = toProposicao(proposicaoSchema.parse(base));
    expect(r.orgaoAtual).toBeNull();
    expect(r.dataUltimaTramitacao).toBeNull();
  });

  it("aceita situação nula (a API devolve nulo em alguns casos)", () => {
    const r = toProposicao(
      proposicaoSchema.parse({ ...base, statusProposicao: { codSituacao: null, descricaoSituacao: null } }),
    );
    expect(r).toMatchObject({ virouLei: false, situacao: null });
  });
});

describe("toOrientacoes", () => {
  it("descarta orientação vazia e mantém Liberado", () => {
    const r = toOrientacoes([
      orientacaoSchema.parse({ orientacaoVoto: "Sim", siglaPartidoBloco: "Oposição" }),
      orientacaoSchema.parse({ orientacaoVoto: "", siglaPartidoBloco: "PL" }),
      orientacaoSchema.parse({ orientacaoVoto: "Liberado", siglaPartidoBloco: "MDB" }),
    ]);
    expect(r).toEqual([
      { partido: "Oposição", orientacao: "Sim" },
      { partido: "MDB", orientacao: "Liberado" },
    ]);
  });
});

describe("toAutores", () => {
  const a = (uri: string, nome: string, ordem: number) =>
    autorSchema.parse({ uri, nome, tipo: "Deputado(a)", codTipo: 1, ordemAssinatura: ordem, proponente: 1 });

  it("liga deputados ao parlamentar e deixa os demais sem vínculo", () => {
    const ids = new Map([["178887", 10]]);
    const r = toAutores(
      [
        a("https://dadosabertos.camara.leg.br/api/v2/deputados/178887", "Rubens", 1),
        a("https://dadosabertos.camara.leg.br/api/v2/orgaos/4", "Poder Executivo", 2),
        a("https://dadosabertos.camara.leg.br/api/v2/deputados/999", "Fora do banco", 3),
      ],
      ids,
    );
    expect(r.map((x) => x.parlamentarId)).toEqual([10, null, null]);
  });

  it("junta autores repetidos pelo nome (chave única do banco)", () => {
    const r = toAutores([a("u/deputados/1", "Ana", 1), a("u/deputados/1", "Ana", 2)], new Map());
    expect(r).toHaveLength(1);
  });
});

describe("extrairNormaJuridica", () => {
  const t = (despacho: string | null, descricaoTramitacao = "Transformação em Norma Jurídica") =>
    tramitacaoSchema.parse({ dataHora: "2024-01-15T00:00", descricaoTramitacao, despacho });

  // Textos reais do campo despacho.
  it.each([
    ["Transformado na Lei Ordinária 14815/2024. DOU 16/01/2024 PÁG 02 COL 02.Republicada por ter saído com incorreção.", "Lei Ordinária 14815/2024"],
    ["Transformado na Lei Ordinária 15468/2026. DOU 14 07 2026 PÁG 01 COL 02.", "Lei Ordinária 15468/2026"],
    ["Transformado na Lei Complementar 238/2026. DOU 21/10/2026 PÁG 01 COL 01 - Edição Extra A.", "Lei Complementar 238/2026"],
    ["Transformado na Lei Ordinária 14600/2023. DOU 20/06/23 PÁG 07 COL 01. Vetado parcialmente.", "Lei Ordinária 14600/2023"],
    ["Decreto Legislativo 123/2024 - Aprova o texto do Acordo de Cooperação", "Decreto Legislativo 123/2024"],
    ["Transformado no Decreto Legislativo 385/2026. DOU 08/09/2026 PÁG 02 COL 01RETIFICAÇÃO DOU 09/09/2026", "Decreto Legislativo 385/2026"],
    ["Transformado na Lei Complementar 217/2025. DOU 19/09/2025 PÁG 01 COL 02. Vetado parcialmente.(MSC-PE 1347/2025)", "Lei Complementar 217/2025"],
  ])("extrai o número de %#", (despacho, esperado) => {
    expect(extrairNormaJuridica([t(despacho)])).toBe(esperado);
  });

  it("MPV sem número no texto fica nulo", () => {
    expect(extrairNormaJuridica([t("Transformado na Lei Ordinária. .")])).toBeNull();
  });

  it("ignora ofícios e despachos nulos, e acha a linha certa no meio", () => {
    const r = extrairNormaJuridica([
      t("Recebido Ofício nº 14/2024-SF que comunica restituição de autógrafo do PL 3696/2023, sancionado.", "Apresentação de Proposição"),
      t(null),
      t("Transformado na Lei Ordinária 14815/2024. DOU 16/01/2024."),
    ]);
    expect(r).toBe("Lei Ordinária 14815/2024");
  });

  it("devolve a data da tramitação que registra a norma (não a de hoje)", () => {
    const r = extrairNorma([
      tramitacaoSchema.parse({
        dataHora: "2026-09-28T00:00",
        descricaoTramitacao: "Transformação em Norma Jurídica",
        despacho: "Transformado na Lei Ordinária 15524/2026. DOU 29/09/2026 PÁG 02 COL 02.",
      }),
    ]);
    expect(r?.data?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("sem nenhuma tramitação de norma devolve nulo", () => {
    expect(extrairNormaJuridica([])).toBeNull();
  });
});
