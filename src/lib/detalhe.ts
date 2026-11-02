// Lógica do detalhe por tributo (sem React): árvores do Federal (mensal) e do Estadual (anual, DCA) e as
// categorias por base de incidência. Valores sempre em R$.

// ---------- dados que vão do servidor para o navegador (em formato compacto) ----------

export interface DetalheFederalDados {
  ano: number; // ano mais recente
  ultimoMes: number; // último mês publicado nesse ano
  tributos: { codigo: string; nome: string; pai: string | null; nivel: number }[];
  valores: [ano: number, mes: number, indiceTributo: number, valor: number][];
  // Tabela VII da Receita: ano fechado ou acumulado até `ateMes`.
  base: { ano: number; ateMes: number; categoria: string; valor: number }[];
}

export interface DetalheEstadualDados {
  anos: number[]; // do mais recente para o mais antigo
  contas: { cod: string; nome: string; nivel: number }[];
  valores: [ano: number, uf: string, indiceConta: number, bruto: number, fundeb: number, transferencias: number, outras: number][];
}

// ---------- Federal ----------

export interface NoFederal {
  codigo: string;
  nome: string;
  valor: number;
  anterior: number | null; // mesmo período do ano anterior, quando existe
  filhos: NoFederal[];
}

export interface ArvoreFederal {
  nos: NoFederal[]; // nível 0, do maior para o menor
  total: number;
  totalAnterior: number | null;
}

export function arvoreFederal(d: DetalheFederalDados, ano: number, meses: number[]): ArvoreFederal {
  const somar = (a: number) => {
    const soma = new Map<number, number>();
    let achou = 0;
    for (const [va, vm, i, v] of d.valores) {
      if (va !== a || !meses.includes(vm)) continue;
      soma.set(i, (soma.get(i) ?? 0) + v);
      achou++;
    }
    return achou > 0 ? soma : null;
  };
  const atual = somar(ano) ?? new Map<number, number>();
  // O ano anterior só serve de comparação se cobre todos os meses do recorte (senão compararia períodos diferentes).
  const mesesDoAnterior = new Set(d.valores.filter((v) => v[0] === ano - 1).map((v) => v[1]));
  const anterior = meses.every((m) => mesesDoAnterior.has(m)) ? somar(ano - 1) : null;

  const indice = new Map(d.tributos.map((t, i) => [t.codigo, i]));
  const montar = (pai: string | null): NoFederal[] =>
    d.tributos
      .filter((t) => t.pai === pai)
      .map((t) => {
        const i = indice.get(t.codigo)!;
        return {
          codigo: t.codigo,
          nome: t.nome,
          valor: atual.get(i) ?? 0,
          anterior: anterior ? (anterior.get(i) ?? 0) : null,
          filhos: montar(t.codigo),
        };
      })
      .sort((a, b) => b.valor - a.valor);

  const nos = montar(null);
  return {
    nos,
    total: nos.reduce((s, n) => s + n.valor, 0),
    totalAnterior: anterior ? nos.reduce((s, n) => s + (n.anterior ?? 0), 0) : null,
  };
}

// ---------- Estadual (DCA) ----------

export interface NoEstadual {
  cod: string;
  nome: string;
  bruto: number;
  fundeb: number;
  transferencias: number;
  outras: number;
  liquido: number;
  filhos: NoEstadual[];
}

export interface ArvoreEstadual {
  nos: NoEstadual[]; // impostos, taxas, contribuição de melhoria
  bruto: number;
  liquido: number;
  deducoes: number;
}

// Nomes curtos para o público; as demais contas usam o nome da DCA.
const NOME_CURTO: Record<string, string> = {
  "RO1.1.1.4.50.1.0": "ICMS",
  "RO1.1.1.4.50.2.0": "Adicional de ICMS (combate à pobreza)",
  "RO1.1.1.2.51.0.0": "IPVA",
  "RO1.1.1.2.52.0.0": "ITCMD (herança e doação)",
  "RO1.1.1.2.50.0.0": "IPTU (Distrito Federal)",
  "RO1.1.1.4.51.1.0": "ISS (Distrito Federal)",
  "RO1.1.1.3.03.0.0": "IR retido na fonte (servidores estaduais)",
  "RO1.1.1.3.03.1.0": "IR retido: rendimentos do trabalho",
  "RO1.1.1.3.03.4.0": "IR retido: outros rendimentos",
  "RO1.1.1.3.03.2.0": "IR retido: rendimentos de capital",
  "RO1.1.1.3.03.3.0": "IR retido: remessa ao exterior",
};

// Itens abaixo desta fatia do total bruto são agrupados em "Demais itens" (a soma continua igual).
const FATIA_MINIMA = 0.001;
const VALOR_MINIMO = 1_000; // R$

const pai = (cod: string): string | null => {
  const partes = cod.slice(2).split(".");
  let i = partes.length - 1;
  while (i >= 0 && Number(partes[i]) === 0) i--;
  if (i <= 1) return null;
  partes[i] = "0".repeat(partes[i].length);
  return `RO${partes.join(".")}`;
};

export function arvoreEstadual(
  d: DetalheEstadualDados,
  ano: number,
  ufs: ReadonlySet<string> | null,
  valorMinimo = VALOR_MINIMO,
): ArvoreEstadual {
  const soma = new Map<number, [number, number, number, number]>();
  for (const [a, uf, i, bruto, f, t, o] of d.valores) {
    if (a !== ano || (ufs && !ufs.has(uf))) continue;
    const s = soma.get(i) ?? [0, 0, 0, 0];
    soma.set(i, [s[0] + bruto, s[1] + f, s[2] + t, s[3] + o]);
  }

  const noDe = (i: number): NoEstadual => {
    const c = d.contas[i];
    const [bruto, fundeb, transferencias, outras] = soma.get(i) ?? [0, 0, 0, 0];
    return { cod: c.cod, nome: NOME_CURTO[c.cod] ?? c.nome, bruto, fundeb, transferencias, outras, liquido: bruto - fundeb - transferencias - outras, filhos: [] };
  };
  const nos = new Map(d.contas.map((c, i) => [c.cod, noDe(i)]));
  for (const c of d.contas) {
    const p = pai(c.cod);
    if (p && nos.has(p)) nos.get(p)!.filhos.push(nos.get(c.cod)!);
  }

  // Sem valor e sem deduções some; nó que só tem um filho com o mesmo valor é a mesma coisa vista duas vezes: mostra o filho.
  const limpar = (n: NoEstadual): NoEstadual | null => {
    const filhos = n.filhos
      .map(limpar)
      .filter((f): f is NoEstadual => f !== null)
      // filho com o mesmo nome do pai é só um nível intermediário da classificação: sobem as partes dele
      .flatMap((f) => (f.nome === n.nome && f.filhos.length > 0 ? f.filhos : [f]))
      .sort((a, b) => b.bruto - a.bruto);
    // Sem valor (ou só centavos e reais soltos, como a contribuição de melhoria de um único ente) não vira linha.
    if (Math.abs(n.bruto) <= valorMinimo && n.fundeb + n.transferencias + n.outras <= valorMinimo) return null;
    if (filhos.length === 1 && Math.abs(filhos[0].bruto - n.bruto) < 1) return filhos[0];
    return { ...n, filhos };
  };

  const topo = d.contas.filter((c) => c.nivel === 1).map((c) => limpar(nos.get(c.cod)!)).filter((n): n is NoEstadual => n !== null).sort((a, b) => b.bruto - a.bruto);
  const bruto = topo.reduce((s, n) => s + n.bruto, 0);
  const liquido = topo.reduce((s, n) => s + n.liquido, 0);
  return { nos: topo.map((n) => agrupar(n, bruto * FATIA_MINIMA)), bruto, liquido, deducoes: bruto - liquido };
}

// Junta os filhos menores que `minimo` num só "Demais itens" (só quando há mais de um, para não esconder um item sozinho).
function agrupar(n: NoEstadual, minimo: number): NoEstadual {
  const filhos = n.filhos.map((f) => agrupar(f, minimo));
  const pequenos = filhos.filter((f) => f.bruto < minimo);
  if (pequenos.length < 2) return { ...n, filhos };
  const soma = (campo: "bruto" | "fundeb" | "transferencias" | "outras" | "liquido") => pequenos.reduce((s, f) => s + f[campo], 0);
  const demais: NoEstadual = {
    cod: `${n.cod}#demais`,
    nome: "Demais itens",
    bruto: soma("bruto"),
    fundeb: soma("fundeb"),
    transferencias: soma("transferencias"),
    outras: soma("outras"),
    liquido: soma("liquido"),
    filhos: [],
  };
  return { ...n, filhos: [...filhos.filter((f) => f.bruto >= minimo), demais] };
}

// ---------- Categorias por base de incidência (taxonomia da Receita Federal) ----------

export const CATEGORIAS = ["Renda e propriedade", "Folha de salários", "Bens e serviços", "Transações financeiras", "Outros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export interface ItemCategoria {
  categoria: string;
  valor: number;
}

// Estadual: impostos sobre patrimônio (1.1.1.2: IPVA, ITCMD) e renda (1.1.1.3) → Renda e propriedade;
// produção e circulação (1.1.1.4: ICMS) → Bens e serviços; o resto e as taxas → Outros.
function categoriaEstadual(cod: string): Categoria | null {
  if (/^RO1\.1\.1\.[23]\.00\.0\.0$/.test(cod)) return "Renda e propriedade";
  if (/^RO1\.1\.1\.4\.00\.0\.0$/.test(cod)) return "Bens e serviços";
  if (/^RO1\.1\.1\.[1-9]\.00\.0\.0$/.test(cod) || /^RO1\.1\.[23]\.0\.00\.0\.0$/.test(cod)) return "Outros";
  return null;
}

export function categoriasEstadual(d: DetalheEstadualDados, ano: number, ufs: ReadonlySet<string> | null): ItemCategoria[] {
  const somas = new Map<string, number>();
  for (const [a, uf, i, bruto] of d.valores) {
    if (a !== ano || (ufs && !ufs.has(uf))) continue;
    const c = categoriaEstadual(d.contas[i].cod);
    if (c) somas.set(c, (somas.get(c) ?? 0) + bruto);
  }
  return CATEGORIAS.map((c) => ({ categoria: c, valor: somas.get(c) ?? 0 })).filter((x) => x.valor > 0);
}
