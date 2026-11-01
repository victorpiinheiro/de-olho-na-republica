import { db } from "@/lib/db";
import {
  normaGerada,
  toAutoresSenado,
  toProposicaoSenado,
  viraNormaJuridica,
} from "@/lib/sources/senado/adapter";
import { buscarMateria, buscarProcesso } from "@/lib/sources/senado/client";

// Busca o processo (e a matéria, se virou norma), grava a proposição e troca os autores.
// Devolve o id interno.
export async function atualizarProposicaoSenado(
  idProcesso: number,
  idPorNomeSenador: Map<string, number>,
): Promise<number> {
  const processo = await buscarProcesso(idProcesso);

  const norma =
    viraNormaJuridica(processo.siglaSituacaoAtual) && processo.codigoMateria
      ? normaGerada(await buscarMateria(processo.codigoMateria))
      : null;

  const dados = toProposicaoSenado(processo, norma);
  const { id } = await db.proposicao.upsert({
    where: { casa_idOrigem: { casa: dados.casa, idOrigem: dados.idOrigem } },
    create: dados,
    update: dados,
    select: { id: true },
  });

  const autores = toAutoresSenado(processo, idPorNomeSenador);
  await db.$transaction([
    db.autor.deleteMany({ where: { proposicaoId: id } }),
    db.autor.createMany({ data: autores.map((a) => ({ ...a, proposicaoId: id })) }),
  ]);
  return id;
}
