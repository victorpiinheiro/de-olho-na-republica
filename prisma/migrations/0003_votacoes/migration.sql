-- AlterEnum
ALTER TYPE "TipoVoto" ADD VALUE 'ARTIGO_17';

-- AlterTable
ALTER TABLE "Votacao" ADD COLUMN "secreta" BOOLEAN NOT NULL DEFAULT false;
