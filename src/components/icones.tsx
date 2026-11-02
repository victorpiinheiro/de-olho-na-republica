import type { ReactNode } from "react";

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icone"
    >
      {children}
    </svg>
  );
}

export const IconeImpostometro = () => (
  <Icone>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Icone>
);

export const IconePessoas = () => (
  <Icone>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
  </Icone>
);

export const IconeInstituicao = () => (
  <Icone>
    <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
  </Icone>
);

export const IconeGrafico = () => (
  <Icone>
    <path d="M4 4v16h16" />
    <path d="M8 16v-5M12.5 16V8M17 16v-8" />
  </Icone>
);

export const IconeNota = () => (
  <Icone>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Icone>
);

export const IconeLivro = () => (
  <Icone>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
  </Icone>
);

export const IconeOrcamento = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9h9" />
  </Icone>
);

export const IconeMenu = () => (
  <Icone>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icone>
);

export const IconeFechar = () => (
  <Icone>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icone>
);
