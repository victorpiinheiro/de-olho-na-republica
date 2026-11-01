import { describe, expect, it } from "vitest";
import {
  autoriaTexto,
  codigo,
  estadoDe,
  pertenceAba,
  placar,
  rotuloResultado,
  statusDe,
  votacaoDestaque,
  type VotacaoResumo,
} from "./leis";

const v = (dia: number, extra: Partial<VotacaoResumo> = {}): VotacaoResumo => ({
  data: new Date(Date.UTC(2026, 9, dia)),
  descricao: `votação ${dia}`,
  aprovada: true,
  simbolica: false,
  secreta: false,
  votosSim: 10,
  votosNao: 2,
  votosAbstencao: 0,
  ...extra,
});

describe("votacaoDestaque", () => {
  it("prefere a nominal mais recente à simbólica mais nova", () => {
    const r = votacaoDestaque([v(1), v(5, { simbolica: true }), v(3)]);
    expect(r?.descricao).toBe("votação 3");
  });
  it("sem nominal, usa a mais recente de todas", () => {
    const r = votacaoDestaque([v(1, { simbolica: true }), v(5, { secreta: true })]);
    expect(r?.descricao).toBe("votação 5");
  });
  it("sem votações devolve nulo", () => {
    expect(votacaoDestaque([])).toBeNull();
  });
  it("não altera o array original", () => {
    const lista = [v(1), v(3)];
    votacaoDestaque(lista);
    expect(lista[0]?.descricao).toBe("votação 1");
  });
});

describe("estadoDe", () => {
  it("distingue nominal, simbólica e secreta", () => {
    expect(estadoDe({ simbolica: false, secreta: false })).toBe("nominal");
    expect(estadoDe({ simbolica: true, secreta: false })).toBe("simbolica");
    expect(estadoDe({ simbolica: false, secreta: true })).toBe("secreta");
  });
});

describe("pertenceAba", () => {
  const prop = (
    virouLei: boolean,
    situacao: string | null,
    votacoes: VotacaoResumo[] = [v(1)],
    casa: "CAMARA" | "SENADO" = "CAMARA",
  ) => ({
    casa,
    virouLei,
    situacao,
    votacoes,
  });

  describe("aba nominais", () => {
    it("só entra quem tem votação nominal com votos computados", () => {
      expect(pertenceAba(prop(false, null, [v(1)]), "nominais")).toBe(true);
      expect(pertenceAba(prop(false, null, [v(1, { simbolica: true, votosSim: 0, votosNao: 0, votosAbstencao: 0 })]), "nominais")).toBe(false);
      expect(pertenceAba(prop(false, null, [v(1, { secreta: true })]), "nominais")).toBe(false);
      expect(pertenceAba(prop(false, null, [v(1, { votosSim: 0, votosNao: 0, votosAbstencao: 0 })]), "nominais")).toBe(false);
      expect(pertenceAba(prop(false, null, []), "nominais")).toBe(false);
    });
    it("uma votação nominal basta, mesmo que a mais recente seja simbólica", () => {
      expect(pertenceAba(prop(false, null, [v(1), v(5, { simbolica: true })]), "nominais")).toBe(true);
    });
  });

  it("todas inclui tudo", () => {
    expect(pertenceAba(prop(false, null), "todas")).toBe(true);
  });
  it("viraram-lei usa virouLei", () => {
    expect(pertenceAba(prop(true, "Transformado em Norma Jurídica"), "viraram-lei")).toBe(true);
    expect(pertenceAba(prop(false, "Pronta para Pauta"), "viraram-lei")).toBe(false);
  });
  it("aprovadas-camara são as que seguem ao Senado, e não as que já viraram lei", () => {
    expect(pertenceAba(prop(false, "Aguardando Apreciação pelo Senado Federal"), "aprovadas-camara")).toBe(true);
    expect(pertenceAba(prop(false, "Enviada ao Senado Federal"), "aprovadas-camara")).toBe(true);
    expect(pertenceAba(prop(true, "Aguardando Apreciação pelo Senado Federal"), "aprovadas-camara")).toBe(false);
    expect(pertenceAba(prop(false, "Pronta para Pauta"), "aprovadas-camara")).toBe(false);
    expect(pertenceAba(prop(false, null), "aprovadas-camara")).toBe(false);
  });
  it("rejeitadas exige arquivada e última votação rejeitada", () => {
    const rej = [v(1), v(4, { aprovada: false })];
    expect(pertenceAba(prop(false, "Arquivada", rej), "rejeitadas")).toBe(true);
    expect(pertenceAba(prop(false, "Arquivada", [v(1)]), "rejeitadas")).toBe(false);
    expect(pertenceAba(prop(false, "Pronta para Pauta", rej), "rejeitadas")).toBe(false);
    // resultado desconhecido não conta como rejeitada
    expect(pertenceAba(prop(false, "Arquivada", [v(4, { aprovada: null })]), "rejeitadas")).toBe(false);
  });
  it("aprovadas-senado: proposição do Senado com última votação aprovada e que ainda não virou lei", () => {
    expect(pertenceAba(prop(false, "Aguardando", [v(1)], "SENADO"), "aprovadas-senado")).toBe(true);
    expect(pertenceAba(prop(true, "Transformada", [v(1)], "SENADO"), "aprovadas-senado")).toBe(false);
    expect(pertenceAba(prop(false, "Aguardando", [v(1, { aprovada: false })], "SENADO"), "aprovadas-senado")).toBe(false);
    expect(pertenceAba(prop(false, "Aguardando", [v(1, { aprovada: null })], "SENADO"), "aprovadas-senado")).toBe(false);
  });
  it("proposição da Câmara nunca cai em aprovadas-senado, nem a do Senado em aprovadas-camara", () => {
    expect(pertenceAba(prop(false, "Enviada ao Senado Federal"), "aprovadas-senado")).toBe(false);
    expect(pertenceAba(prop(false, "Enviada ao Senado Federal", [v(1)], "SENADO"), "aprovadas-camara")).toBe(false);
  });
  it("rejeitadas no Senado vale pela última votação, sem exigir arquivamento", () => {
    expect(pertenceAba(prop(false, "Aguardando", [v(1), v(4, { aprovada: false })], "SENADO"), "rejeitadas")).toBe(true);
    expect(pertenceAba(prop(false, "Aguardando", [v(4, { aprovada: null })], "SENADO"), "rejeitadas")).toBe(false);
  });
});

describe("placar", () => {
  it("calcula larguras que somam 100", () => {
    const p = placar(461, 4, 1);
    expect(p.total).toBe(466);
    expect(p.sim + p.nao + p.abst).toBeCloseTo(100);
  });
  it("sem votos devolve zeros", () => {
    expect(placar(0, 0, 0)).toEqual({ total: 0, sim: 0, nao: 0, abst: 0 });
  });
});

describe("rotuloResultado e codigo", () => {
  it("resultado desconhecido não vira rejeitado", () => {
    expect(rotuloResultado(null)).toBe("Sem resultado");
    expect(rotuloResultado(false)).toBe("Rejeitada");
    expect(rotuloResultado(true)).toBe("Aprovada");
  });
  it("monta o código da proposição", () => {
    expect(codigo({ siglaTipo: "PLP", numero: 186, ano: 2026 })).toBe("PLP 186/2026");
  });
});

describe("statusDe", () => {
  const prop = (
    virouLei: boolean,
    situacao: string | null,
    votacoes: VotacaoResumo[] = [v(1)],
    casa: "CAMARA" | "SENADO" = "CAMARA",
  ) => ({
    casa,
    virouLei,
    situacao,
    votacoes,
  });
  it("virou lei tem prioridade sobre qualquer situação", () => {
    expect(statusDe(prop(true, "Aguardando Apreciação pelo Senado Federal"))).toEqual({ rotulo: "Virou lei", tom: "lei" });
  });
  it("arquivada com última votação rejeitada é Rejeitada", () => {
    expect(statusDe(prop(false, "Arquivada", [v(2, { aprovada: false })]))).toEqual({ rotulo: "Rejeitada", tom: "rejeitada" });
  });
  it("arquivada sem rejeição mostra a situação, sem inventar rejeição", () => {
    expect(statusDe(prop(false, "Arquivada"))).toEqual({ rotulo: "Arquivada", tom: "neutro" });
  });
  it("proposição do Senado aprovada no plenário vira Aprovada no Senado; rejeitada, Rejeitada", () => {
    expect(statusDe(prop(false, "Aguardando", [v(1)], "SENADO")).rotulo).toBe("Aprovada no Senado");
    expect(statusDe(prop(false, "Aguardando", [v(1, { aprovada: false })], "SENADO"))).toEqual({
      rotulo: "Rejeitada",
      tom: "rejeitada",
    });
  });
  it("segue ao Senado vira Aprovada na Câmara; sem situação, Em tramitação", () => {
    expect(statusDe(prop(false, "Enviada ao Senado Federal")).rotulo).toBe("Aprovada na Câmara");
    expect(statusDe(prop(false, null)).rotulo).toBe("Em tramitação");
  });
});

describe("autoriaTexto", () => {
  it("monta prefixo, partido–UF e 'e outros N'", () => {
    expect(autoriaTexto({ nome: "Helena Duarte", tipo: "Deputado(a)", partido: "PT", uf: "SP" }, 0)).toBe("Dep. Helena Duarte (PT–SP)");
    expect(autoriaTexto({ nome: "Augusto Vieira", tipo: "Senador(a)" }, 26)).toBe("Sen. Augusto Vieira e outros 26");
  });
  it("sem partido informado mostra só a UF, não o rótulo interno", () => {
    expect(
      autoriaTexto({ nome: "Rodrigo Pacheco", tipo: "Senador(a)", partido: "Sem partido informado", uf: "MG" }, 0),
    ).toBe("Sen. Rodrigo Pacheco (MG)");
  });
  it("um autor a mais fica no singular", () => {
    expect(autoriaTexto({ nome: "Ana", tipo: "Deputado(a)" }, 1)).toBe("Dep. Ana e outro autor");
  });
  it("Executivo fica só com o nome", () => {
    expect(autoriaTexto({ nome: "Poder Executivo", tipo: "Órgão do Poder Executivo" }, 0)).toBe("Poder Executivo");
  });
});
