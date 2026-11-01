-- Orçamento da União por função e subfunção (Siconfi, RREO-Anexo 02).
CREATE TABLE "DespesaFuncao" (
    "id" SERIAL NOT NULL,
    "ano" INTEGER NOT NULL,
    "bimestre" INTEGER NOT NULL,
    "funcao" TEXT NOT NULL,
    "subfuncao" TEXT NOT NULL DEFAULT '',
    "dotacaoInicial" DECIMAL(18,2),
    "dotacaoAtualizada" DECIMAL(18,2),
    "empenhado" DECIMAL(18,2),
    "liquidado" DECIMAL(18,2),
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "DespesaFuncao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DespesaFuncao_ano_bimestre_funcao_subfuncao_key" ON "DespesaFuncao"("ano", "bimestre", "funcao", "subfuncao");

-- RLS sem policy, como em todas as tabelas (ver 0002_enable_rls).
ALTER TABLE "DespesaFuncao" ENABLE ROW LEVEL SECURITY;
