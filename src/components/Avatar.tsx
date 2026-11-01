// Foto oficial hospedada pela Câmara (não guardamos a imagem). Sem foto, mostra a inicial.
export function Avatar({
  nome,
  fotoUrl,
  tamanho,
}: {
  nome: string;
  fotoUrl: string | null;
  tamanho: number;
}) {
  if (!fotoUrl) {
    return (
      <span
        className="avatar avatar-inicial"
        style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4 }}
        aria-hidden="true"
      >
        {nome.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fotoUrl}
      alt=""
      width={tamanho}
      height={tamanho}
      loading="lazy"
      decoding="async"
      className="avatar"
    />
  );
}
