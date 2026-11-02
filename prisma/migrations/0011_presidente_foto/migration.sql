-- Foto do presidente (Wikidata P18) com crédito e licença do Wikimedia Commons.
ALTER TABLE "Presidente"
  ADD COLUMN "fotoUrl" TEXT,
  ADD COLUMN "fotoAutor" TEXT,
  ADD COLUMN "fotoLicenca" TEXT,
  ADD COLUMN "fotoLicencaUrl" TEXT,
  ADD COLUMN "fotoPagina" TEXT;
