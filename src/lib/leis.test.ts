import { describe, expect, it } from "vitest";
import {
  autoriaTexto,
  codigo,
  estadoDe,
  pecEmAndamento,
  pertenceAba,
  placar,
  rotuloOrgao,
  rotuloResultado,
  SITUACOES_ENCERRADAS,
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

describe("statusDe de medida provisória sem votação", () => {
  const mp = (situacao: string | null, vigenciaFim: Date | null) => ({
    casa: "CAMARA" as const,
    virouLei: false,
    situacao,
    votacoes: [],
    siglaTipo: "MPV",
    vigenciaFim,
  });
  const hoje = new Date(2026, 10, 6);
  it("dentro do prazo, está em vigor", () => {
    expect(statusDe(mp(null, new Date(Date.UTC(2027, 1, 12))), hoje).rotulo).toBe("Em vigor");
    expect(statusDe(mp(null, new Date(Date.UTC(2026, 10, 6))), hoje).rotulo).toBe("Em vigor"); // último dia ainda vale
  });
  it("prazo vencido sem situação oficial ainda: prazo encerrado", () => {
    expect(statusDe(mp(null, new Date(Date.UTC(2026, 10, 5))), hoje).rotulo).toBe("Prazo encerrado");
  });
  it("sem abertura de prazo", () => {
    expect(statusDe(mp(null, null), hoje).rotulo).toBe("Prazo ainda não aberto");
  });
  it("com situação oficial, vale a situação", () => {
    expect(statusDe(mp("Perdeu a Eficácia", new Date(Date.UTC(2026, 3, 2))), hoje).rotulo).toBe("Perdeu a Eficácia");
  });
  it("pertence à aba de medidas provisórias, votada ou não", () => {
    expect(pertenceAba(mp(null, null), "medidas-provisorias")).toBe(true);
    expect(pertenceAba({ ...mp(null, null), siglaTipo: "PL" }, "medidas-provisorias")).toBe(false);
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

describe("PEC em andamento", () => {
  const pec = (situacao: string | null, extra: { casa?: "CAMARA" | "SENADO"; siglaTipo?: string } = {}) => ({
    casa: extra.casa ?? ("CAMARA" as const),
    siglaTipo: extra.siglaTipo ?? "PEC",
    situacao,
  });

  it("vale para PEC da Câmara com qualquer situação que não seja de encerramento", () => {
    // A PEC 32/2015 está "Aguardando Parecer", sem nunca ter ido a plenário.
    expect(pecEmAndamento(pec("Aguardando Parecer"))).toBe(true);
    expect(pecEmAndamento(pec("Aguardando Apreciação pelo Senado Federal"))).toBe(true);
    expect(pecEmAndamento(pec("Pronta para Pauta"))).toBe(true);
    expect(pecEmAndamento(pec("Tramitando em Conjunto"))).toBe(true);
  });

  it("não vale para PEC arquivada, que virou norma, foi retirada ou recusada", () => {
    for (const s of ["Arquivada", "Enviada ao Arquivo", "Transformado em Norma Jurídica", "Retirado pelo(a) Autor(a)", "Recusado"]) {
      expect(pecEmAndamento(pec(s)), s).toBe(false);
    }
  });

  it("ignora espaço sobrando no texto da situação (a Câmara manda alguns com espaço no fim)", () => {
    expect(pecEmAndamento(pec("Aguardando Despacho de Arquivamento "))).toBe(false);
    expect(pecEmAndamento(pec("Aguardando Parecer "))).toBe(true);
  });

  it("sem situação informada não dá para saber: fica de fora", () => {
    expect(pecEmAndamento(pec(null))).toBe(false);
  });

  it("não vale para outro tipo nem para o Senado", () => {
    expect(pecEmAndamento(pec("Aguardando Parecer", { siglaTipo: "PL" }))).toBe(false);
    expect(pecEmAndamento(pec("Aguardando Parecer", { siglaTipo: "MPV" }))).toBe(false);
    expect(pecEmAndamento(pec("Aguardando Parecer", { casa: "SENADO" }))).toBe(false);
  });

  it("a lista de situações encerradas não tem repetição nem espaço sobrando", () => {
    expect(new Set(SITUACOES_ENCERRADAS).size).toBe(SITUACOES_ENCERRADAS.length);
    for (const s of SITUACOES_ENCERRADAS) expect(s).toBe(s.trim());
  });

  it("pertenceAba('pecs') usa a mesma regra, com ou sem votação em plenário", () => {
    const base = { virouLei: false, votacoes: [] as VotacaoResumo[] };
    expect(pertenceAba({ ...base, ...pec("Aguardando Parecer") }, "pecs")).toBe(true);
    expect(pertenceAba({ ...base, votacoes: [v(1)], ...pec("Aguardando Parecer") }, "pecs")).toBe(true);
    expect(pertenceAba({ ...base, ...pec("Arquivada") }, "pecs")).toBe(false);
    expect(pertenceAba({ ...base, ...pec("Aguardando Parecer", { siglaTipo: "PL" }) }, "pecs")).toBe(false);
  });

  it("o selo do card de uma PEC sem votação é a situação oficial", () => {
    const r = statusDe({ virouLei: false, votacoes: [], ...pec("Aguardando Parecer") });
    expect(r).toEqual({ rotulo: "Aguardando Parecer", tom: "neutro" });
  });
});

describe("rotuloOrgao", () => {
  it("a comissão especial de uma PEC vem com o número da PEC", () => {
    expect(rotuloOrgao("PEC03215")).toBe("Comissão especial (PEC03215)");
  });
  it("traduz o plenário e deixa o resto como a Câmara escreve", () => {
    expect(rotuloOrgao("PLEN")).toBe("Plenário");
    expect(rotuloOrgao("CCJC")).toBe("CCJC");
  });
});
