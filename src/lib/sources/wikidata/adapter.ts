import { arquivoDaFoto, fotosPorArquivo, type CommonsResposta, type FotoNossa } from "./commons";
import type { FotoRow, MandatoRow, PartidoRow } from "./schemas";

export interface MandatoNosso {
  inicio: string; // YYYY-MM-DD
  fim: string | null; // null = em exercício
}

export interface PresidenteNosso {
  wikidataId: string;
  nome: string;
  partidos: string[];
  mandatos: MandatoNosso[];
}

const DIA_MS = 86_400_000;
const MINIMO_PRESIDENTES = 30; // o Brasil já teve 36: bem menos que isso indica consulta quebrada

const dia = (iso: string) => iso.slice(0, 10);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function qid(uri: string): string {
  const m = /\/entity\/(Q\d+)$/.exec(uri);
  if (!m) throw new Error(`URI do Wikidata inesperada: ${uri}`);
  return m[1];
}

// O Wikidata registra cada mandato como uma declaração: FHC e Lula vêm em duas linhas seguidas, e Dilma
// em duas com o corte em 31/12/2014 → 01/01/2015. Mandatos da mesma pessoa que se encostam viram um só.
export function juntarMandatos(mandatos: MandatoNosso[]): MandatoNosso[] {
  const ordenados = [...mandatos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const out: MandatoNosso[] = [];
  for (const m of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo?.inicio === m.inicio) continue; // duplicata
    if (ultimo?.fim && ms(m.inicio) - ms(ultimo.fim) <= DIA_MS) {
      ultimo.fim = m.fim;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

export function toPresidentes(mandatos: MandatoRow[], partidos: PartidoRow[]): PresidenteNosso[] {
  const porId = new Map<string, PresidenteNosso>();
  const brutos = new Map<string, MandatoNosso[]>();
  for (const r of mandatos) {
    const id = qid(r.item.value);
    if (!porId.has(id)) porId.set(id, { wikidataId: id, nome: r.itemLabel.value, partidos: [], mandatos: [] });
    brutos.set(id, [...(brutos.get(id) ?? []), { inicio: dia(r.inicio.value), fim: r.fim ? dia(r.fim.value) : null }]);
  }
  for (const r of partidos) {
    const p = porId.get(qid(r.item.value));
    if (p && !p.partidos.includes(r.partidoLabel.value)) p.partidos.push(r.partidoLabel.value);
  }

  const out = [...porId.values()].map((p) => ({
    ...p,
    partidos: p.partidos.sort((a, b) => a.localeCompare(b, "pt")),
    mandatos: juntarMandatos(brutos.get(p.wikidataId) ?? []),
  }));

  if (out.length < MINIMO_PRESIDENTES) throw new Error(`só ${out.length} presidentes: consulta incompleta`);
  const emExercicio = out.flatMap((p) => p.mandatos).filter((m) => m.fim === null);
  if (emExercicio.length > 1) throw new Error(`${emExercicio.length} mandatos em exercício ao mesmo tempo`);
  return out.sort((a, b) => a.mandatos[0].inicio.localeCompare(b.mandatos[0].inicio));
}

export interface PresidenteComFoto extends PresidenteNosso {
  foto: FotoNossa | null;
}

const MINIMO_FOTOS = 25; // hoje são 36 de 36: bem menos que isso indica consulta ou API quebrada

// Liga a foto (Wikidata P18) e seu crédito (Commons) a cada presidente. Quem não tem foto, ou tem foto sem licença
// conhecida, fica com `foto: null` e aparece em `semFoto` para o job avisar.
export function comFotos(
  presidentes: PresidenteNosso[],
  fotos: FotoRow[],
  commons: CommonsResposta[],
): { presidentes: PresidenteComFoto[]; semFoto: string[] } {
  const arquivoPorId = new Map<string, string>();
  for (const f of [...fotos].sort((a, b) => a.foto.value.localeCompare(b.foto.value))) {
    const id = qid(f.item.value);
    if (!arquivoPorId.has(id)) arquivoPorId.set(id, arquivoDaFoto(f.foto.value));
  }
  const porArquivo = fotosPorArquivo(commons, [...new Set(arquivoPorId.values())]);

  const out = presidentes.map((p) => {
    const arquivo = arquivoPorId.get(p.wikidataId);
    return { ...p, foto: arquivo ? (porArquivo.get(arquivo) ?? null) : null };
  });
  const comFoto = out.filter((p) => p.foto).length;
  if (comFoto < MINIMO_FOTOS) throw new Error(`só ${comFoto} presidentes com foto e licença: consulta incompleta`);
  return { presidentes: out, semFoto: out.filter((p) => !p.foto).map((p) => p.nome) };
}
