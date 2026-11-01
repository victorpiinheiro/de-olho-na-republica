import { db } from "@/lib/db";
import { runJob } from "@/lib/job";
import { log } from "@/lib/log";
import { temSegundoTurno, toEleicao } from "@/lib/sources/tse/adapter";
import { buscarResultado, CARGO_TSE, descobrirEleicao, type CargoTse } from "@/lib/sources/tse/client";
import { NOME_UF } from "@/lib/ufs";

type Carga = ReturnType<typeof toEleicao>;

// Busca e valida TUDO antes de gravar: se o TSE mudar o formato, o job aborta sem tocar no banco.
async function carregarCargo(cargo: CargoTse, abrangencias: string[]): Promise<Carga[]> {
  const codigos = await descobrirEleicao(cargo);
  const cargas: Carga[] = [];
  for (const abr of abrangencias) {
    const primeiro = await buscarResultado(codigos.turno1, cargo, abr);
    cargas.push(toEleicao(primeiro));
    // O 2º turno só existe onde houve finalistas; para o Brasil (Presidente) ele é obrigatório.
    if (temSegundoTurno(primeiro)) {
      cargas.push(toEleicao(await buscarResultado(codigos.turno2, cargo, abr)));
    }
  }
  return cargas;
}

// Carga única: Presidente (Brasil + UFs) e Governador (UFs). Senador, deputados e municipais
// ficam de fora (sem comparação entre turnos / fora do orçamento de armazenamento).
runJob("sync-eleicoes", async () => {
  const ufs = Object.keys(NOME_UF).map((u) => u.toLowerCase());
  const cargas = [
    ...(await carregarCargo(CARGO_TSE.PRESIDENTE, ["br", ...ufs])),
    ...(await carregarCargo(CARGO_TSE.GOVERNADOR, ufs)),
  ];

  const presidenteBr2t = cargas.some(
    (c) => c.eleicao.cargo === "Presidente" && c.eleicao.uf === "BR" && c.eleicao.turno === 2,
  );
  if (!presidenteBr2t) throw new Error("sem 2º turno de Presidente no Brasil: dados incompletos");

  for (const { eleicao, candidatos } of cargas) {
    const chave = { ano: eleicao.ano, turno: eleicao.turno, cargo: eleicao.cargo, uf: eleicao.uf };
    await db.$transaction(async (tx) => {
      const salva = await tx.eleicao.upsert({
        where: { ano_turno_cargo_uf: chave },
        create: eleicao,
        update: eleicao,
      });
      await tx.resultadoCandidato.deleteMany({ where: { eleicaoId: salva.id } });
      await tx.resultadoCandidato.createMany({
        data: candidatos.map((c) => ({ ...c, eleicaoId: salva.id })),
      });
    });
  }

  const por = (cargo: string, turno: number) =>
    cargas.filter((c) => c.eleicao.cargo === cargo && c.eleicao.turno === turno).length;
  log("info", "eleições gravadas");
  return {
    presidente1t: por("Presidente", 1),
    presidente2t: por("Presidente", 2),
    governador1t: por("Governador", 1),
    governador2t: por("Governador", 2),
  };
});
