import { db } from "@/lib/db";
import { diasEntre, iniciais, periodoDe } from "@/lib/historia";

export interface MandatoDto {
  inicio: string; // YYYY-MM-DD
  fim: string | null; // null = em exercício
  periodoId: string;
}

export interface PresidenteDto {
  id: number;
  nome: string;
  iniciais: string;
  partidos: string[];
  periodoId: string; // período do primeiro mandato (agrupa a lista)
  mandatos: MandatoDto[];
  // Foto do Wikimedia Commons com crédito; null = sem foto ou sem licença conhecida.
  foto: { url: string; autor: string | null; licenca: string; licencaUrl: string | null; pagina: string } | null;
  emExercicio: boolean;
  // Dias somados dos mandatos encerrados. Com mandato em curso a tela mostra "em exercício", sem contar até hoje.
  diasEncerrados: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function listarPresidentes(): Promise<{ presidentes: PresidenteDto[]; hoje: string }> {
  const rows = await db.presidente.findMany({ include: { mandatos: { orderBy: { inicio: "asc" } } } });
  const presidentes = rows
    .filter((r) => r.mandatos.length > 0)
    .map((r): PresidenteDto => {
      const mandatos = r.mandatos.map((m) => ({
        inicio: iso(m.inicio),
        fim: m.fim ? iso(m.fim) : null,
        periodoId: periodoDe(iso(m.inicio)).id,
      }));
      return {
        id: r.id,
        nome: r.nome,
        iniciais: iniciais(r.nome),
        partidos: r.partidos,
        periodoId: mandatos[0].periodoId,
        mandatos,
        foto:
          r.fotoUrl && r.fotoLicenca && r.fotoPagina
            ? { url: r.fotoUrl, autor: r.fotoAutor, licenca: r.fotoLicenca, licencaUrl: r.fotoLicencaUrl, pagina: r.fotoPagina }
            : null,
        emExercicio: mandatos.some((m) => m.fim === null),
        diasEncerrados: mandatos.reduce((s, m) => (m.fim ? s + diasEntre(m.inicio, m.fim) : s), 0),
      };
    })
    .sort((a, b) => a.mandatos[0].inicio.localeCompare(b.mandatos[0].inicio));
  return { presidentes, hoje: iso(new Date()) };
}
