-- Valor a preços constantes (IPCA) para a variação real do Impostômetro.
ALTER TABLE "Arrecadacao" ADD COLUMN "valorReal" DECIMAL(18,2);

-- População e outros números únicos usados na tela.
CREATE TABLE "Indicador" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "Indicador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Indicador_chave_referencia_key" ON "Indicador"("chave", "referencia");

-- RLS sem policy, como em todas as tabelas (ver 0002_enable_rls).
ALTER TABLE "Indicador" ENABLE ROW LEVEL SECURITY;
