-- História do país: presidentes e mandatos (Wikidata).
CREATE TABLE "Presidente" (
    "id" SERIAL NOT NULL,
    "wikidataId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "partidos" TEXT[],

    CONSTRAINT "Presidente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MandatoPresidencial" (
    "id" SERIAL NOT NULL,
    "presidenteId" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,

    CONSTRAINT "MandatoPresidencial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Presidente_wikidataId_key" ON "Presidente"("wikidataId");
CREATE UNIQUE INDEX "MandatoPresidencial_presidenteId_inicio_key" ON "MandatoPresidencial"("presidenteId", "inicio");

ALTER TABLE "MandatoPresidencial" ADD CONSTRAINT "MandatoPresidencial_presidenteId_fkey"
    FOREIGN KEY ("presidenteId") REFERENCES "Presidente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS sem policy, como em todas as tabelas (ver 0002_enable_rls).
ALTER TABLE "Presidente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MandatoPresidencial" ENABLE ROW LEVEL SECURITY;
