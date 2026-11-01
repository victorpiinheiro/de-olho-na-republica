import { db } from "@/lib/db";
import { projetarMeses, type LinhaArrecadacao } from "@/lib/impostometro";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { bimestreParaMeses, type ArrecadacaoEstadual, receitaDoBimestre, type ReceitaBimestre } from "@/lib/sources/siconfi/adapter";
import { buscarRreo, listarEstados, type Estado } from "@/lib/sources/siconfi/client";

const BIMESTRES = 6;
const SIMULTANEAS = 5;
const ESTADOS_ESPERADOS = 27; // 26 estados + DF

const anoAtualBr = () =>
  Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));

// Roda `fn` sobre os itens com no máximo `n` chamadas simultâneas, mantendo a ordem.
async function emLotes<T, R>(itens: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        out[i] = await fn(itens[i]);
      }
    }),
  );
  return out;
}

// Receita de cada UF num bimestre; null se algum estado ainda não publicou o RREO.
async function bimestreDosEstados(estados: Estado[], ano: number, bimestre: number): Promise<Map<string, ReceitaBimestre> | null> {
  const porEstado = await emLotes(estados, SIMULTANEAS, async (e) => ({ e, linhas: await buscarRreo(ano, bimestre, e.codIbge) }));
  const faltam = porEstado.filter((x) => x.linhas.length === 0).map((x) => x.e.nome);
  if (faltam.length === estados.length) return null;
  if (faltam.length > 0) {
    log("warn", "bimestre incompleto, ignorado até todos os estados publicarem", { ano, bimestre, faltam });
    return null;
  }
  const porUf = new Map<string, ReceitaBimestre>();
  for (const { e, linhas } of porEstado) {
    const ufs = new Set(linhas.map((l) => l.uf));
    if (ufs.size !== 1) throw new Error(`${e.nome}: RREO com UFs ${[...ufs].join(",")}`);
    porUf.set([...ufs][0], receitaDoBimestre(linhas, ano, bimestre));
  }
  return porUf;
}

// Arrecadação estadual por UF (Impostos e Taxas, RREO dos 27 estados no Siconfi) + projeção dos meses sem dado.
// Idempotente: upsert por (esfera, tributo, ano, mes).
runJob("sync-arrecadacao-estados", async () => {
  const ano = anoAtualBr();
  const estados = await listarEstados();
  if (estados.length !== ESTADOS_ESPERADOS) {
    throw new Error(`esperava ${ESTADOS_ESPERADOS} estados no Siconfi, vieram ${estados.length}`);
  }

  // Ano anterior completo: base da projeção.
  const oficiais: ArrecadacaoEstadual[] = [];
  for (let b = 1; b <= BIMESTRES; b++) {
    const r = await bimestreDosEstados(estados, ano - 1, b);
    if (!r) throw new Error(`RREO de ${ano - 1} sem o bimestre ${b} em algum estado`);
    for (const [uf, receita] of r) oficiais.push(...bimestreParaMeses(uf, ano - 1, b, receita));
  }

  let ultimoBimestre = 0;
  for (let b = 1; b <= BIMESTRES; b++) {
    const r = await bimestreDosEstados(estados, ano, b);
    if (!r) break;
    for (const [uf, receita] of r) oficiais.push(...bimestreParaMeses(uf, ano, b, receita));
    ultimoBimestre = b;
  }
  if (ultimoBimestre === 0) throw new Error(`nenhum bimestre de ${ano} publicado por todos os estados`);

  const comoLinha = (l: ArrecadacaoEstadual): LinhaArrecadacao => ({
    tributo: l.tributo, ano: l.ano, mes: l.mes, valor: l.valor, estimado: false, valorReal: null,
  });
  // Projeção por UF: cada estado cresce no seu próprio ritmo.
  const ufs = [...new Set(oficiais.map((l) => l.uf))];
  const projecao = ufs.flatMap((uf) =>
    projetarMeses(ano, oficiais.filter((l) => l.uf === uf).map(comoLinha)).map((l) => ({ ...l, uf })),
  );

  await db.$transaction([
    ...oficiais.map((l) => {
      const chave = { esfera: l.esfera, uf: l.uf, tributo: l.tributo, ano: l.ano, mes: l.mes };
      return db.arrecadacao.upsert({
        where: { esfera_uf_tributo_ano_mes: chave },
        create: l,
        update: { valor: l.valor, estimado: false, valorReal: null },
      });
    }),
    ...projecao.map((l) => {
      const chave = { esfera: "ESTADUAL" as const, uf: l.uf, tributo: l.tributo, ano: l.ano, mes: l.mes };
      return db.arrecadacao.upsert({
        where: { esfera_uf_tributo_ano_mes: chave },
        create: { ...chave, valor: l.valor, estimado: true, valorReal: null },
        update: { valor: l.valor, estimado: true, valorReal: null },
      });
    }),
  ]);

  return {
    ano,
    ultimoBimestre,
    ateMes: ultimoBimestre * 2,
    linhasOficiais: oficiais.length,
    ufs: ufs.length,
    linhasProjetadas: projecao.length,
  };
});
