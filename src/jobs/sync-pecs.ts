import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { pecEmAndamento } from "@/lib/leis";
import { toAutores, toProposicao } from "@/lib/sources/camara/adapter";
import { buscarProposicao, listarAutores, listarPecsComMovimento, listarPecsDoAno } from "@/lib/sources/camara/client";

// A Constituição é de 1988: não há PEC anterior com tramitação a mostrar.
const PRIMEIRO_ANO = 1988;
const CONCORRENCIA = 4;
// A API aceita no máximo 3 meses entre as datas de tramitação. Com folga para execuções perdidas do agendador.
const DIAS_DE_MOVIMENTO = 60;

async function emParalelo<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

// PECs da Câmara em andamento (a API lista todas, inclusive as que nunca foram a plenário), com a situação, o órgão onde
// estão e a data da última movimentação. O sync de votações só conhece as que já foram votadas em plenário.
//
// Dois modos, porque a API não filtra por situação (o parâmetro é ignorado) e só aceita janelas de 3 meses:
//  - padrão (diário): só as PECs com tramitação nos últimos 60 dias. Mudar de situação (arquivar, virar norma) é uma
//    tramitação, então a janela pega toda mudança; não precisa reconsultar as ~800 abertas todo dia;
//  - --completo (semanal): varre TODAS as PECs desde 1988, por ano de apresentação, e consulta a situação de cada uma
//    (~2,5 mil chamadas). Acha a que ficou parada anos e voltou, e a primeira carga.
// Só PEC em andamento é gravada (com os autores). PEC encerrada, ou sem situação na fonte (centenas de PECs antigas,
// de 1988 em diante, vêm assim, a maioria arquivada pela Mesa), não entra no banco, a menos que já estivesse nele
// (foi a plenário): nesse caso só a situação é atualizada.
// Idempotente: upsert por (casa, idOrigem), a mesma chave do sync-votacoes.
runJob("sync-pecs", async () => {
  const completo = process.argv.includes("--completo");
  const hoje = new Date();

  const existentes = await db.proposicao.findMany({
    where: { casa: "CAMARA", siglaTipo: "PEC" },
    select: { idOrigem: true, situacao: true },
  });
  const noBanco = new Map(existentes.map((p) => [p.idOrigem, p.situacao]));
  // A mesma regra da aba (lib/leis.ts): não encerrada E com situação informada.
  const emAndamento = (situacao: string | null) => pecEmAndamento({ casa: "CAMARA", siglaTipo: "PEC", situacao });

  const alvo = new Set<number>();
  // 1) quem teve tramitação recente
  const inicio = new Date(hoje.getTime() - DIAS_DE_MOVIMENTO * 86_400_000);
  const recentes = await listarPecsComMovimento(dia(inicio), dia(hoje));
  for (const p of recentes) alvo.add(p.id);
  // 2) varredura completa: todas, menos as que já sabemos encerradas (ou sem situação)
  let naFonte = recentes.length;
  if (completo) {
    const total = new Set<number>();
    for (let ano = PRIMEIRO_ANO; ano <= hoje.getFullYear(); ano++) {
      for (const p of await listarPecsDoAno(ano)) total.add(p.id);
    }
    naFonte = total.size;
    for (const id of total) {
      if (!noBanco.has(String(id)) || emAndamento(noBanco.get(String(id)) ?? null)) alvo.add(id);
    }
  }

  const parlamentares = await db.parlamentar.findMany({ select: { id: true, idOrigem: true } });
  const idPorOrigem = new Map(parlamentares.map((p) => [p.idOrigem, p.id]));

  const resumo = { novas: 0, atualizadas: 0, encerradasAtualizadas: 0, encerradasIgnoradas: 0 };
  const falhas: { id: number; erro: string }[] = [];

  await emParalelo([...alvo], CONCORRENCIA, async (id) => {
    try {
      const prop = await buscarProposicao(id);
      if (prop.siglaTipo !== "PEC") throw new Error(`esperava PEC, veio ${prop.siglaTipo}`);
      const dados = toProposicao(prop);
      const jaTinha = noBanco.has(dados.idOrigem);
      if (!emAndamento(dados.situacao)) {
        if (!jaTinha) {
          resumo.encerradasIgnoradas++;
          return;
        }
        // Já estava no banco (foi a plenário): só atualiza a situação, sem mexer nos autores.
        await db.proposicao.update({
          where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
          data: dados,
        });
        resumo.encerradasAtualizadas++;
        return;
      }
      const autores = await listarAutores(id);
      const { id: proposicaoId } = await db.proposicao.upsert({
        where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
        create: dados,
        update: dados,
        select: { id: true },
      });
      const novos = toAutores(autores, idPorOrigem);
      await db.$transaction([
        db.autor.deleteMany({ where: { proposicaoId } }),
        db.autor.createMany({ data: novos.map((a) => ({ ...a, proposicaoId })) }),
      ]);
      if (jaTinha) resumo.atualizadas++;
      else resumo.novas++;
    } catch (e) {
      falhas.push({ id, erro: e instanceof Error ? e.message : String(e) });
    }
  });

  if (falhas.length > 0) {
    throw new Error(`${falhas.length} de ${alvo.size} PECs falharam`, { cause: falhas.slice(0, 5) });
  }
  return { modo: completo ? "completo" : "diario", naFonte, consultadas: alvo.size, ...resumo };
});
