-- Medida provisória: vigência no Congresso (lida da tramitação oficial da Câmara).
ALTER TABLE "Proposicao"
  ADD COLUMN "vigenciaInicio" DATE,
  ADD COLUMN "vigenciaFim" DATE,
  ADD COLUMN "prorrogada" BOOLEAN NOT NULL DEFAULT false;
