import { db } from "@/lib/db";
import type { Cargo, Disputa, Turno } from "@/lib/eleicoes";

const ANO = 2026;

// Presidente e Governador, Brasil + UFs: ~90 eleições e ~600 candidatos, pequeno o bastante
// para a página carregar tudo e filtrar no navegador (a rota é estática).
export async function listarDisputas(): Promise<Disputa[]> {
  const eleicoes = await db.eleicao.findMany({
    where: { ano: ANO, cargo: { in: ["Presidente", "Governador"] } },
    include: { resultados: { orderBy: { votos: "desc" } } },
  });

  const turno = (e: (typeof eleicoes)[number]): Turno => ({
    aptos: e.aptos,
    comparecimento: e.comparecimento,
    abstencoes: e.abstencoes,
    brancosNulos: e.votosBrancos + e.votosNulos,
    votosValidos: e.votosValidos,
    candidatos: e.resultados.map((r) => ({
      numero: r.numero,
      nome: r.nome,
      partido: r.partido,
      votos: r.votos,
      percentual: Number(r.percentual),
      eleito: r.eleito,
    })),
  });

  const disputas = new Map<string, Disputa>();
  for (const e of eleicoes) {
    const chave = `${e.cargo}|${e.uf}`;
    const atual = disputas.get(chave);
    const d: Disputa = atual ?? { cargo: e.cargo as Cargo, uf: e.uf, turno1: undefined as never, turno2: null };
    if (e.turno === 1) d.turno1 = turno(e);
    else d.turno2 = turno(e);
    disputas.set(chave, d);
  }
  return [...disputas.values()].filter((d) => d.turno1);
}
