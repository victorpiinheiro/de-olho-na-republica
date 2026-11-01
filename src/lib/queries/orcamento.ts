import { db } from "@/lib/db";

export interface ValoresOrc {
  dotacao: number | null; // dotação atualizada (o previsto)
  empenhado: number | null;
  liquidado: number | null; // despesa executada
}

export interface SubfuncaoOrc extends ValoresOrc {
  nome: string;
}

export interface FuncaoOrc extends ValoresOrc {
  nome: string;
  subfuncoes: SubfuncaoOrc[];
}

export interface OrcamentoAno {
  ano: number;
  bimestre: number; // acumulado de janeiro ao fim deste bimestre
  total: { dotacao: number; empenhado: number; liquidado: number };
  funcoes: FuncaoOrc[]; // na ordem oficial da fonte
}

const num = (d: { toString(): string } | null) => (d === null ? null : Number(d));

interface LinhaSql {
  ano: number;
  bimestre: number;
  funcao: string;
  subfuncao: string;
  dotacaoAtualizada: unknown;
  empenhado: unknown;
  liquidado: unknown;
}

// Para cada ano, o último bimestre carregado. Uma consulta só (cada ida ao banco custa ~1 s daqui).
export async function carregarOrcamento(): Promise<OrcamentoAno[]> {
  const rows = await db.$queryRaw<LinhaSql[]>`
    SELECT d.ano, d.bimestre, d.funcao, d.subfuncao, d."dotacaoAtualizada", d.empenhado, d.liquidado
    FROM "DespesaFuncao" d
    JOIN (SELECT ano, MAX(bimestre) AS bimestre FROM "DespesaFuncao" GROUP BY ano) u
      ON u.ano = d.ano AND u.bimestre = d.bimestre
    ORDER BY d.ano, d.ordem`;

  const porAno = new Map<number, { bimestre: number; funcoes: FuncaoOrc[] }>();
  for (const r of rows) {
    const ano = porAno.get(r.ano) ?? { bimestre: r.bimestre, funcoes: [] };
    porAno.set(r.ano, ano);
    const valores = { dotacao: num(r.dotacaoAtualizada as never), empenhado: num(r.empenhado as never), liquidado: num(r.liquidado as never) };
    if (r.subfuncao === "") ano.funcoes.push({ nome: r.funcao, ...valores, subfuncoes: [] });
    else ano.funcoes[ano.funcoes.length - 1]?.subfuncoes.push({ nome: r.subfuncao, ...valores });
  }

  return [...porAno.entries()]
    .map(([ano, { bimestre, funcoes }]): OrcamentoAno => {
      const soma = (campo: keyof ValoresOrc) => funcoes.reduce((s, f) => s + (f[campo] ?? 0), 0);
      return { ano, bimestre, total: { dotacao: soma("dotacao"), empenhado: soma("empenhado"), liquidado: soma("liquidado") }, funcoes };
    })
    .sort((a, b) => b.ano - a.ano);
}
