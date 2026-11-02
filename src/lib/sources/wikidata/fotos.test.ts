import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { comFotos, toPresidentes } from "./adapter";
import { arquivoDaFoto, commonsSchema, limparAutor, toFoto } from "./commons";
import { fotosSchema, mandatosSchema, partidosSchema } from "./schemas";

// Fixtures: respostas reais do Wikidata (SPARQL) e do Wikimedia Commons (API) em 02/11/2026.
const ler = (nome: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", nome), "utf8"));
const base = toPresidentes(mandatosSchema.parse(ler("mandatos.json")).results.bindings, partidosSchema.parse(ler("partidos.json")).results.bindings);
const fotos = fotosSchema.parse(ler("fotos.json")).results.bindings;
const commons = commonsSchema.parse(ler("commons.json"));
const { presidentes, semFoto } = comFotos(base, fotos, [commons]);
const por = (nome: string) => presidentes.find((p) => p.nome === nome)!;

describe("limparAutor", () => {
  it.each([
    ['<a href="https://www.flickr.com/people/palaciodoplanalto/">Palácio do Planalto</a> from Brasilia, Brasil', "Palácio do Planalto from Brasilia, Brasil"],
    ["Own work--Jebulon (talk) 09:40, 6 June 2014 (UTC)", "Jebulon"],
    // HTML real do Commons (foto de Epitácio Pessoa)
    ['<span class="int-own-work" lang="en">Own work</span>--<a href="//commons.wikimedia.org/wiki/User:Jebulon" title="User:Jebulon">Jebulon</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Jebulon" title="User talk:Jebulon"><span class="signature-talk">talk</span></a>) 09:40, 6 June 2014 (UTC)', "Jebulon"],
    // HTML real do Commons (foto de Figueiredo): o nome vem num <p>, o resto numa lista
    ['<p><a href="https://pt.wikipedia.org/wiki/Governo_do_Brasil" title="pt:Governo do Brasil">Governo do Brasil</a>\n</p>\n<ul><li>Original image uploader <a href="//commons.wikimedia.org/wiki/User:Sfs90">Sfs90</a></li></ul>', "Governo do Brasil"],
    ['<bdi><a href="https://www.wikidata.org/wiki/Q5924114"><span title="Swedish painter (1875-1950)">Bror Kronstrand</span></a></bdi>', "Bror Kronstrand"],
    ["Governo do Brasil\n\nOriginal image uploader Sfs90", "Governo do Brasil"],
    ["Beto Barata/PR", "Beto Barata/PR"],
    ["Ubirajara Dettimar/Presidência da República", "Ubirajara Dettimar/Presidência da República"],
    ["R &amp; D", "R & D"],
  ])("%s", (html, esperado) => expect(limparAutor(html)).toBe(esperado));

  it.each(['Unknown author<span style="display: none;">Unknown author</span>', '<div class="fn value">\nUnknown<span style="display: none;">Unknown </span></div>', "Unknown authorUnknown author", "\nUnknownUnknown ", "Desconhecido", "", "   "])("autor desconhecido (%j) vira nulo", (html) => {
    expect(limparAutor(html)).toBeNull();
  });

  it("corta nomes muito longos", () => {
    expect(limparAutor("A".repeat(300))!.length).toBeLessThanOrEqual(100);
  });
});

describe("arquivoDaFoto", () => {
  it("tira o endereço, decodifica e troca _ por espaço", () => {
    expect(arquivoDaFoto("http://commons.wikimedia.org/wiki/Special:FilePath/Getulio%20Vargas%20%281930%29.jpg")).toBe("Getulio Vargas (1930).jpg");
    expect(arquivoDaFoto("http://commons.wikimedia.org/wiki/Special:FilePath/Foto_Oficial.jpg")).toBe("Foto Oficial.jpg");
  });
  it("recusa endereço fora do padrão", () => {
    expect(() => arquivoDaFoto("https://exemplo.com/foto.jpg")).toThrow(/inesperado/);
  });
});

describe("comFotos (dados reais)", () => {
  it("os 36 presidentes têm foto, com licença e página no Commons", () => {
    expect(presidentes).toHaveLength(36);
    expect(semFoto).toEqual([]);
    for (const p of presidentes) {
      expect(p.foto, p.nome).not.toBeNull();
      expect(p.foto!.licenca, p.nome).toBeTruthy();
      expect(p.foto!.pagina, p.nome).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      // miniaturas ficam em thumb.wikimedia.org; arquivos menores que 480 px voltam como original em upload.wikimedia.org
      expect(p.foto!.url, p.nome).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\/wikipedia\/commons\//);
    }
  });

  it("guarda a miniatura sem parâmetros de rastreio", () => {
    for (const p of presidentes) expect(p.foto!.url).not.toContain("?");
  });

  it("as fotos com licença Creative Commons trazem o autor (exigência da licença)", () => {
    for (const p of presidentes.filter((x) => /^CC /.test(x.foto!.licenca))) {
      if (p.nome !== "José Sarney") expect(p.foto!.autor, p.nome).not.toBeNull();
    }
    expect(por("Michel Temer").foto).toMatchObject({ licenca: "CC BY 2.0", autor: "Beto Barata/PR" });
  });

  it("licenças: 28 em domínio público e 8 Creative Commons", () => {
    const contagem = new Map<string, number>();
    for (const p of presidentes) contagem.set(p.foto!.licenca, (contagem.get(p.foto!.licenca) ?? 0) + 1);
    expect(contagem.get("Public domain")).toBe(28);
    expect([...contagem].filter(([l]) => l !== "Public domain").reduce((s, [, n]) => s + n, 0)).toBe(8);
  });

  it("autor desconhecido fica nulo, e a tela mostra 'autor desconhecido'", () => {
    expect(por("Floriano Peixoto").foto!.autor).toBeNull();
    expect(por("Delfim Moreira").foto!.autor).toBeNull();
  });
});

describe("comFotos (casos de falha)", () => {
  it("foto sem licença conhecida não entra", () => {
    const sem = {
      ...commons,
      query: {
        ...commons.query,
        pages: commons.query.pages.map((p, i) =>
          i === 0 && p.imageinfo ? { ...p, imageinfo: [{ ...p.imageinfo[0], extmetadata: { ...p.imageinfo[0].extmetadata, LicenseShortName: undefined } }] } : p,
        ),
      },
    };
    const r = comFotos(base, fotos, [sem]);
    expect(r.semFoto).toHaveLength(1);
  });

  it("foto com restrição declarada (ex.: direitos de personalidade) não entra", () => {
    const info = commons.query.pages[0].imageinfo![0];
    expect(toFoto({ ...info, extmetadata: { ...info.extmetadata, Restrictions: { value: "personality" } } })).toBeNull();
  });

  it("falha se quase nenhuma foto tiver licença (consulta ou API quebrada)", () => {
    const vazia = { ...commons, query: { ...commons.query, pages: commons.query.pages.map((p) => ({ title: p.title, missing: true })) } };
    expect(() => comFotos(base, fotos, [vazia])).toThrow(/consulta incompleta/);
  });

  it("falha se a resposta do Commons perder um campo que usamos", () => {
    const quebrada = JSON.parse(JSON.stringify(ler("commons.json")));
    delete quebrada.query.pages[0].imageinfo[0].thumburl;
    expect(() => commonsSchema.parse(quebrada)).toThrow();
  });
});
