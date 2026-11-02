# De Olho na República

Site de transparência política. Reúne, em um só lugar, o que o Congresso gasta e vota, quanto o país arrecada e gasta, como foram as eleições e quem governou o Brasil desde 1889.

**Regra principal: nenhum dado é digitado à mão.** Tudo vem de fontes oficiais, coletado por jobs agendados e gravado no nosso banco. O site nunca chama APIs do governo direto: ele só lê do banco. Quando um número é estimativa, a tela diz isso.

> **Estado do projeto:** telas, jobs de coleta, workflows agendados, rota de revalidação e alertas de falha estão prontos. Falta cadastrar os segredos no GitHub e fazer o deploy na Vercel. Veja [`docs/OPERACAO.md`](docs/OPERACAO.md) e [O que falta](#o-que-falta).

---

## As telas e de onde vem cada dado

| Tela | O que mostra | Fonte oficial |
|---|---|---|
| **Impostômetro** | Arrecadação de tributos no ano: dados oficiais (por mês, bimestre ou acumulado, filtrável por esfera, UF e tributo), detalhe por tributo (Federal mensal; Estadual anual: ICMS, IPVA, ITCMD...), por base de incidência, e uma projeção animada, rotulada como projeção | Federal: Receita Federal (relatório mensal de arrecadação, PDF, Tabelas I, III e VII). Estadual: Tesouro Nacional, API Siconfi (RREO bimestral, líquido; DCA anual, bruta) |
| **Parlamentares** | Deputados e senadores, ranking de gasto da cota parlamentar, presença, perfil com notas fiscais | Câmara: Dados Abertos da Câmara (API REST e CSV anual de despesas). Senado: Dados Abertos do Senado (API) e verbas indenizatórias (CEAPS) |
| **Leis e votações** | Proposições que viraram lei, foram aprovadas ou rejeitadas, resumo, autoria, placar, tramitação e como cada parlamentar votou | Câmara e Senado (Dados Abertos), mesmas APIs acima |
| **Eleições 2026** | Resultados do 1º e do 2º turno, comparação entre os dois, comparecimento, finalistas e virada por UF | TSE, resultados oficiais (`resultados.tse.jus.br`) |
| **História do país** | Linha do tempo dos presidentes desde 1889, agrupados por período, com mandatos e partido | Wikidata (consulta SPARQL: cargo de Presidente do Brasil) |
| **Orçamento** | Despesa da União por função de governo (Saúde, Educação, Previdência...) e subfunção, executado × previsto | Tesouro Nacional, API Siconfi (RREO Anexo 02, ente União) |

### Como ler cada tela

**Impostômetro**
- *Dados oficiais*: o que a fonte publicou. A Receita Federal publica por mês. Os estados publicam por bimestre; para exibir por mês, cada bimestre é dividido em dois meses iguais (a soma é preservada), e por isso o recorte "mês" fica desativado para Estadual e Total.
- *Projeção em tempo real*: o contador animado = base oficial acumulada + taxa por segundo. Os meses ainda não publicados são estimados a partir do mesmo mês do ano anterior, vezes o crescimento médio. É sempre exibido como **projeção**, nunca como dado oficial.
- *Total* = Federal + Estadual, só no período em que os dois estão publicados. **Atenção ao bruto × líquido:** o Federal é
  bruto, mas o Estadual do RREO vem **líquido** dos repasses aos municípios e do FUNDEB (em 2025: R$ 805 bi no RREO contra
  R$ 1.155 bi brutos na DCA). A tela rotula isso, e o bruto por imposto (ICMS, IPVA, ITCMD) aparece no bloco "Estadual por
  imposto", que é anual (a DCA de um ano sai por volta de abril do seguinte).
- *Detalhe por tributo:* o Federal vem aberto por tributo, mês a mês (Tabela I da Receita), e por base de incidência
  (Tabela VII). Os parsers conferem que as partes somam o total e falham se o layout do PDF mudar.
- **Municipal não entra.** O RREO municipal sai incompleto (em uma amostra de 40 municípios, cerca de 60% entregaram, cobrindo cerca de 90% da população). Um total parcial seria lido como o total do país. Só vale reavaliar com dado completo.

**Parlamentares e perfil**
- Cota parlamentar (CEAP na Câmara, CEAPS no Senado): gasto por categoria, por mês e a lista de despesas com link para a nota. Guardamos só a URL da nota, nunca a imagem.
- Despesas da Câmara vêm com duplicatas na origem; são removidas por hash dos campos.

**Leis e votações**
- "Virou lei" significa proposição transformada em norma jurídica (lei, lei complementar, emenda constitucional, decreto legislativo). Votação aprovada em uma casa não é lei.
- A data exibida para uma lei é a da sanção (Câmara: tramitação "Transformação em Norma Jurídica"; Senado: assinatura da norma).
- Votação simbólica não tem votos nominais: é um estado próprio, não uma lista vazia.
- Resumo = campo `ementa` oficial. Não usamos texto gerado por IA.

**Eleições**
- Só agregados usados na tela (Brasil e UF por candidato), nunca dados por seção eleitoral. O 1º e o 2º turno têm códigos de eleição diferentes no TSE.

**História do país**
- Só dados estruturados do Wikidata, sem texto de IA. Os períodos (República Velha, Era Vargas, República de 1946, Regime militar, Nova República) são uma tabela fixa no código (`src/lib/historia.ts`), por data de início do mandato.
- As juntas militares de 1930 e 1969 não são pessoas no Wikidata e ficam de fora, com aviso na tela.
- O Wikidata não data a filiação partidária por mandato. Quem tem um único partido aparece como "Partido"; quem tem vários, como "Filiações ao longo da vida".

**Orçamento**
- Só a União. O valor é a **despesa liquidada acumulada no ano**, até o último bimestre publicado (o Siconfi tem cerca de 2 meses de atraso).
- A classificação é por função, não por programa. Por exemplo, o Bolsa Família está dentro de "Assistência Social", e a fonte não o separa como linha própria.
- "Encargos Especiais" (dívida e transferências a estados e municípios) é cerca de 40% do total e não é gasto em uma área específica; vem com aviso.
- O job confere que as subfunções somam a função e que as funções somam o total. Se a estrutura da fonte mudar, ele falha em vez de gravar número errado.

---

## Como funciona

```
Fontes oficiais ──► jobs (src/jobs) ──► Postgres (Supabase) ──► Next.js (só lê o banco)
   APIs/CSV/PDF     validam com Zod       idempotentes            páginas com ISR
```

- **Adapters** (`src/lib/sources/<fonte>/`): um por fonte, com `client.ts` (HTTP, retry com backoff em 5xx/429, paginação), `schemas.ts` (Zod) e `adapter.ts` (converte o formato externo para o nosso modelo).
- **Validação:** toda resposta externa passa por Zod. Uma coluna renomeada na fonte quebra a validação, em vez de gravar dado errado.
- **Jobs idempotentes:** upsert com chave única; podem rodar quantas vezes forem preciso sem duplicar.
- **Testes dos adapters** usam respostas reais salvas como fixtures. Não há dado inventado no código.
- **Páginas:** ISR por seção (Leis 1 h; Parlamentares, Impostômetro e Orçamento 24 h; Eleições e História estáticas). Nenhuma página consulta o banco a cada visita.

### Stack
Next.js (App Router) · TypeScript estrito · Prisma · PostgreSQL (Supabase) · Zod · React Query · Vitest. Jobs em Node (`tsx`), pensados para rodar no GitHub Actions. Site pensado para a Vercel, na mesma região do banco (`iad1`).

### Segurança
- O Supabase expõe o schema `public` por uma API REST. Por isso as migrations ligam **RLS em todas as tabelas, sem nenhuma policy**. O Prisma conecta como `postgres` e não é afetado.
- O front não usa o client do Supabase nem a chave anon.
- Nenhuma variável sensível tem prefixo `NEXT_PUBLIC_`. Segredos ficam no `.env` local (ignorado pelo git), nos Secrets do GitHub e nas variáveis da Vercel.

---

## Jobs de coleta

Cada um roda com `npm run sync:<nome>`.

| Comando | O que faz | Frequência prevista |
|---|---|---|
| `sync:deputados` | Lista de deputados | semanal |
| `sync:senadores` | Lista de senadores | semanal |
| `sync:despesas` | Despesas da cota (Câmara, CSV anual) | diária |
| `sync:ceaps` | Despesas dos senadores (CEAPS) | diária |
| `sync:votacoes` | Votações e votos da Câmara | de hora em hora, 8h–20h, dias úteis |
| `sync:proposicoes` | Situação e data de lei das proposições da Câmara | diária |
| `sync:votacoes-senado` | Votações e votos do Senado | de hora em hora, 8h–20h, dias úteis |
| `job:tamanho-banco` | Registra o tamanho do banco; falha acima de 400 MB | semanal |
| `job:revalidar` | Chama `/api/revalidate` ao fim dos outros jobs | após cada workflow |
| `sync:proposicoes-senado` | Situação e norma das proposições do Senado | diária |
| `sync:arrecadacao` | Arrecadação federal (Receita) | mensal (dia 5) |
| `sync:arrecadacao-estados` | Arrecadação estadual, 27 UFs (Siconfi, RREO); leva cerca de 8 min | mensal |
| `sync:arrecadacao-detalhe` | Federal por tributo (Tabela I) e por base de incidência (Tabela VII) | mensal |
| `sync:receita-estadual` | Receita estadual bruta por imposto, com deduções (DCA anual) | mensal |
| `sync:orcamento` | Orçamento da União (Siconfi) | mensal (o RREO sai a cada bimestre) |
| `sync:eleicoes` | Resultados do TSE | carga única, manual |
| `sync:presidentes` | Presidentes (Wikidata) | carga única, manual |

---

## Rodando localmente

Pré-requisitos: Node 20+ e um banco Postgres (o projeto usa o Supabase).

```bash
npm install                 # também roda prisma generate
cp .env.example .env        # preencha DATABASE_URL, DIRECT_URL e as URLs das fontes
npx prisma migrate deploy   # cria as tabelas (e liga o RLS)
npm run sync:deputados      # rode os jobs de que precisar, ex.: sync:orcamento
npm run dev                 # http://localhost:3000
```

Outros comandos: `npm test` (testes), `npm run typecheck`, `npm run lint`, `npm run build`.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão do app e dos jobs (pooler, porta 6543) |
| `DIRECT_URL` | Só migrations (conexão direta, porta 5432) |
| `REVALIDATE_SECRET` | Protege a rota `POST /api/revalidate` |
| `CAMARA_DESPESAS_CSV_URL` | CSV anual de despesas da Câmara; `{ano}` é substituído |
| `SENADO_CEAPS_URL` | API de despesas dos senadores (CEAPS); `{ano}` é substituído |
| `RECEITA_ANALISE_URL` | Relatório de arrecadação da Receita Federal |

---

## Limites do banco grátis

O Supabase grátis tem 500 MB, 5 GB de egress por mês e pausa após 1 semana sem atividade. Por isso: despesas só da legislatura atual, notas fiscais só como URL, leis só com ementa e link do PDF, eleições só agregadas.

## O que falta

Operação (veja [`docs/OPERACAO.md`](docs/OPERACAO.md)):
- Cadastrar os Secrets e Variables no GitHub
- Deploy na Vercel e cadastro de `SITE_URL`
- Rodar a primeira carga em ordem

Melhorias conhecidas: inserts em lote no job estadual; conferir se há sobreposição entre Federal e Estadual no total do Impostômetro; confirmar se "Serviço da Dívida Interna" inclui rolagem da dívida.

## Contribuindo e licença

Contribuições são bem-vindas. Antes de abrir um PR, rode `npm test`, `npm run typecheck` e `npm run lint`. As decisões de projeto estão em [`CLAUDE.md`](CLAUDE.md).

Licença: ainda não definida.
