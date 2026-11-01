import { fetchBytes, HttpError } from "../../http";
import { log } from "../../log";

const MES_URL = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// O relatório do mês M sai nas últimas semanas de M+1: tenta o mês anterior e volta alguns.
const MESES_PARA_TRAS = 4;

// Mês e ano de hoje no fuso de Brasília.
function mesAtualBr(agora: Date) {
  const [ano, mes] = agora
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  return { ano, mes };
}

export function urlDaAnalise(modelo: string, ano: number, mes: number): string {
  return modelo.replace(/\{ano\}/g, String(ano)).replace(/\{mes\}/g, MES_URL[mes - 1]);
}

export interface Analise {
  pdf: Uint8Array;
  ano: number;
  mes: number; // último mês coberto pelo relatório
}

export async function baixarUltimaAnalise(modelo: string, agora = new Date()): Promise<Analise> {
  let { ano, mes } = mesAtualBr(agora);
  for (let i = 0; i < MESES_PARA_TRAS; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    const url = urlDaAnalise(modelo, ano, mes);
    try {
      return { pdf: await fetchBytes(url, { retries: 3 }), ano, mes };
    } catch (e) {
      // Relatório ainda não publicado: o servidor responde 403 ou 404.
      if (e instanceof HttpError && (e.status === 403 || e.status === 404)) {
        log("info", "relatório ainda não publicado", { url, status: e.status });
        continue;
      }
      throw e;
    }
  }
  throw new Error(`nenhum relatório da Receita nos últimos ${MESES_PARA_TRAS} meses`);
}
