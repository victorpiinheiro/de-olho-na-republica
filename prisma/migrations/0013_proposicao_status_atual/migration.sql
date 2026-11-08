-- Status atual da proposição na Câmara: órgão onde está e data da última movimentação (aba "PECs em andamento").
ALTER TABLE "Proposicao"
  ADD COLUMN "orgaoAtual" TEXT,
  ADD COLUMN "dataUltimaTramitacao" DATE;
