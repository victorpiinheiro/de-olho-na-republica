// Roda `fn` sobre os itens com no máximo `n` chamadas simultâneas, mantendo a ordem do resultado.
export async function emLotes<T, R>(itens: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
