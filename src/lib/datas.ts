const iso = (d: Date) => d.toISOString().slice(0, 10);

export function diasAtras(n: number, de = new Date()): string {
  const d = new Date(de);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}

// Quebra [desde, ate] (YYYY-MM-DD, inclusivo) em janelas de no máximo um mês civil,
// para não pedir anos de votações numa consulta só.
export function intervalosMensais(desde: string, ate: string): [string, string][] {
  const fim = new Date(`${ate}T00:00:00Z`);
  const janelas: [string, string][] = [];
  let ini = new Date(`${desde}T00:00:00Z`);
  while (ini <= fim) {
    const fimDoMes = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 0));
    janelas.push([iso(ini), iso(fimDoMes < fim ? fimDoMes : fim)]);
    ini = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 1));
  }
  return janelas;
}
