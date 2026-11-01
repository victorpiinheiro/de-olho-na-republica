-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Casa" AS ENUM ('CAMARA', 'SENADO');

-- CreateEnum
CREATE TYPE "TipoVoto" AS ENUM ('SIM', 'NAO', 'ABSTENCAO', 'OBSTRUCAO', 'AUSENTE');

-- CreateEnum
CREATE TYPE "Esfera" AS ENUM ('FEDERAL', 'ESTADUAL', 'MUNICIPAL');

-- CreateTable
CREATE TABLE "Parlamentar" (
    "id" SERIAL NOT NULL,
    "casa" "Casa" NOT NULL,
    "idOrigem" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeCivil" TEXT,
    "partido" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "fotoUrl" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legislatura" INTEGER NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parlamentar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" SERIAL NOT NULL,
    "parlamentarId" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "cnpjCpf" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "dataDocumento" DATE,
    "urlDocumento" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposicao" (
    "id" SERIAL NOT NULL,
    "casa" "Casa" NOT NULL,
    "idOrigem" TEXT NOT NULL,
    "siglaTipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "ementa" TEXT NOT NULL,
    "resumoIa" TEXT,
    "urlInteiroTeor" TEXT,
    "situacao" TEXT,
    "virouLei" BOOLEAN NOT NULL DEFAULT false,
    "normaJuridica" TEXT,
    "dataApresentacao" DATE,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Autor" (
    "id" SERIAL NOT NULL,
    "proposicaoId" INTEGER NOT NULL,
    "parlamentarId" INTEGER,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Autor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Votacao" (
    "id" SERIAL NOT NULL,
    "casa" "Casa" NOT NULL,
    "idOrigem" TEXT NOT NULL,
    "proposicaoId" INTEGER,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "aprovada" BOOLEAN,
    "simbolica" BOOLEAN NOT NULL DEFAULT false,
    "votosSim" INTEGER NOT NULL DEFAULT 0,
    "votosNao" INTEGER NOT NULL DEFAULT 0,
    "votosAbstencao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Votacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voto" (
    "id" SERIAL NOT NULL,
    "votacaoId" INTEGER NOT NULL,
    "parlamentarId" INTEGER NOT NULL,
    "partido" TEXT NOT NULL,
    "voto" "TipoVoto" NOT NULL,

    CONSTRAINT "Voto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrientacaoPartido" (
    "id" SERIAL NOT NULL,
    "votacaoId" INTEGER NOT NULL,
    "partido" TEXT NOT NULL,
    "orientacao" TEXT NOT NULL,

    CONSTRAINT "OrientacaoPartido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eleicao" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "turno" INTEGER NOT NULL,
    "cargo" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "codigoTse" TEXT,
    "aptos" INTEGER NOT NULL,
    "comparecimento" INTEGER NOT NULL,
    "abstencoes" INTEGER NOT NULL,
    "votosBrancos" INTEGER NOT NULL,
    "votosNulos" INTEGER NOT NULL,
    "votosValidos" INTEGER NOT NULL,

    CONSTRAINT "Eleicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoCandidato" (
    "id" SERIAL NOT NULL,
    "eleicaoId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "partido" TEXT NOT NULL,
    "votos" INTEGER NOT NULL,
    "percentual" DECIMAL(6,3) NOT NULL,
    "eleito" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResultadoCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arrecadacao" (
    "id" SERIAL NOT NULL,
    "esfera" "Esfera" NOT NULL,
    "tributo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "estimado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Arrecadacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parlamentar_casa_uf_idx" ON "Parlamentar"("casa", "uf");

-- CreateIndex
CREATE INDEX "Parlamentar_casa_partido_idx" ON "Parlamentar"("casa", "partido");

-- CreateIndex
CREATE UNIQUE INDEX "Parlamentar_casa_idOrigem_key" ON "Parlamentar"("casa", "idOrigem");

-- CreateIndex
CREATE UNIQUE INDEX "Despesa_hash_key" ON "Despesa"("hash");

-- CreateIndex
CREATE INDEX "Despesa_parlamentarId_ano_mes_idx" ON "Despesa"("parlamentarId", "ano", "mes");

-- CreateIndex
CREATE INDEX "Despesa_ano_mes_idx" ON "Despesa"("ano", "mes");

-- CreateIndex
CREATE INDEX "Proposicao_virouLei_idx" ON "Proposicao"("virouLei");

-- CreateIndex
CREATE UNIQUE INDEX "Proposicao_casa_idOrigem_key" ON "Proposicao"("casa", "idOrigem");

-- CreateIndex
CREATE UNIQUE INDEX "Autor_proposicaoId_nome_key" ON "Autor"("proposicaoId", "nome");

-- CreateIndex
CREATE INDEX "Votacao_data_idx" ON "Votacao"("data");

-- CreateIndex
CREATE INDEX "Votacao_proposicaoId_idx" ON "Votacao"("proposicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Votacao_casa_idOrigem_key" ON "Votacao"("casa", "idOrigem");

-- CreateIndex
CREATE INDEX "Voto_parlamentarId_idx" ON "Voto"("parlamentarId");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_votacaoId_parlamentarId_key" ON "Voto"("votacaoId", "parlamentarId");

-- CreateIndex
CREATE UNIQUE INDEX "OrientacaoPartido_votacaoId_partido_key" ON "OrientacaoPartido"("votacaoId", "partido");

-- CreateIndex
CREATE UNIQUE INDEX "Eleicao_ano_turno_cargo_uf_key" ON "Eleicao"("ano", "turno", "cargo", "uf");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoCandidato_eleicaoId_numero_key" ON "ResultadoCandidato"("eleicaoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Arrecadacao_esfera_tributo_ano_mes_key" ON "Arrecadacao"("esfera", "tributo", "ano", "mes");

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_parlamentarId_fkey" FOREIGN KEY ("parlamentarId") REFERENCES "Parlamentar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autor" ADD CONSTRAINT "Autor_proposicaoId_fkey" FOREIGN KEY ("proposicaoId") REFERENCES "Proposicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autor" ADD CONSTRAINT "Autor_parlamentarId_fkey" FOREIGN KEY ("parlamentarId") REFERENCES "Parlamentar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votacao" ADD CONSTRAINT "Votacao_proposicaoId_fkey" FOREIGN KEY ("proposicaoId") REFERENCES "Proposicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "Votacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_parlamentarId_fkey" FOREIGN KEY ("parlamentarId") REFERENCES "Parlamentar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrientacaoPartido" ADD CONSTRAINT "OrientacaoPartido_votacaoId_fkey" FOREIGN KEY ("votacaoId") REFERENCES "Votacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoCandidato" ADD CONSTRAINT "ResultadoCandidato_eleicaoId_fkey" FOREIGN KEY ("eleicaoId") REFERENCES "Eleicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

