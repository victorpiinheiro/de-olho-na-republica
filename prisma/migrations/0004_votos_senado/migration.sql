-- O presidente da sessão vota em casos específicos nas duas casas (art. 17 da Câmara, art. 51 do Senado).
-- RENAME preserva as linhas já gravadas com o valor antigo.
ALTER TYPE "TipoVoto" RENAME VALUE 'ARTIGO_17' TO 'PRESIDENTE';

-- Senado: senador presente que não registrou voto (P-NRV).
ALTER TYPE "TipoVoto" ADD VALUE 'PRESENTE_SEM_VOTO';
