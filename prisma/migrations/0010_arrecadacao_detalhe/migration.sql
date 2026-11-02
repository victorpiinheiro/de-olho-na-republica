-- Arrecadação detalhada: federal por tributo (mensal), federal por base de incidência (anual)
-- e receita estadual bruta anual com deduções (DCA).
CREATE TABLE "ArrecadacaoFederalDetalhe" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pai" TEXT,
    "nivel" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ArrecadacaoFederalDetalhe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArrecadacaoFederalDetalhe_ano_mes_codigo_key" ON "ArrecadacaoFederalDetalhe"("ano", "mes", "codigo");

CREATE TABLE "ArrecadacaoFederalBase" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "ateMes" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ArrecadacaoFederalBase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArrecadacaoFederalBase_ano_categoria_key" ON "ArrecadacaoFederalBase"("ano", "categoria");

CREATE TABLE "ReceitaEstadualAnual" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "uf" TEXT NOT NULL,
    "codConta" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "bruto" DECIMAL(18,2) NOT NULL,
    "deducaoFundeb" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deducaoTransferencias" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outrasDeducoes" DECIMAL(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT "ReceitaEstadualAnual_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceitaEstadualAnual_ano_uf_codConta_key" ON "ReceitaEstadualAnual"("ano", "uf", "codConta");

-- RLS ligado e sem policy: a API REST do Supabase não enxerga as tabelas (o Prisma conecta como postgres).
ALTER TABLE "ArrecadacaoFederalDetalhe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArrecadacaoFederalBase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceitaEstadualAnual" ENABLE ROW LEVEL SECURITY;
