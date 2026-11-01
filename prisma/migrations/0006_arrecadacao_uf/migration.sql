-- Arrecadação estadual por UF (filtro do Impostômetro). Federal fica em "BR".
-- As linhas ESTADUAL existentes eram o total do Brasil: saem, e o job sync-arrecadacao-estados as recria por UF.
DELETE FROM "Arrecadacao" WHERE "esfera" = 'ESTADUAL';

ALTER TABLE "Arrecadacao" ADD COLUMN "uf" TEXT NOT NULL DEFAULT 'BR';

DROP INDEX "Arrecadacao_esfera_tributo_ano_mes_key";
CREATE UNIQUE INDEX "Arrecadacao_esfera_uf_tributo_ano_mes_key" ON "Arrecadacao"("esfera", "uf", "tributo", "ano", "mes");
