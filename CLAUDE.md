# De Olho na República — contexto do projeto

## O que é
Site de transparência política com 5 seções na sidebar:
1. **Impostômetro**: contador em tempo real da arrecadação de tributos em 2026
2. **Parlamentares**: deputados e senadores, com gastos da cota parlamentar, notas fiscais e presença
3. **Leis e votações**: o que foi votado, quem propôs, resumo e como cada parlamentar votou
4. **Eleições 2026**: resultados do TSE e comparação entre 1º e 2º turno
5. **História do país**: linha do tempo dos presidentes da República desde 1889, por período

## Regra principal
NENHUM dado é inserido à mão. Tudo vem de fontes oficiais via jobs agendados.
O front NUNCA chama APIs do governo diretamente: lê do nosso banco.

---

## Stack
- Next.js (App Router) + TypeScript strict
- PostgreSQL no Supabase + Prisma
- Zod para validar toda resposta externa
- React Query no front, quando houver interação client-side
- Jobs: scripts Node em `src/jobs`, executados pelo GitHub Actions (schedule)

## Infraestrutura

### Banco: Supabase (plano grátis)
- Projeto criado na região **East US (North Virginia, us-east-1)**, pois a opção de São Paulo não estava disponível.
- Limites que guiam decisões: 500 MB de Postgres, 5 GB de egress/mês, pausa após 1 semana sem atividade.
- Prisma com duas conexões:
  ```env
  # app e jobs (pooler)
  DATABASE_URL="postgresql://postgres.[ref]:[senha]@aws-0-[região].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
  # só migrations (conexão direta)
  DIRECT_URL="postgresql://postgres.[ref]:[senha]@aws-0-[região].pooler.supabase.com:5432/postgres"
  ```
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```
- **Segurança:** o Supabase expõe o schema `public` numa API REST pública. Criar uma migration que
  liga RLS em TODAS as tabelas, sem nenhuma policy. O Prisma conecta como `postgres` e não é afetado.
  Nunca usar o client do Supabase (`@supabase/supabase-js`) nem a chave anon no front.
- **Orçamento de armazenamento:**
  - Despesas: só a legislatura atual
  - Notas fiscais: só a URL (`urlDocumento`), nunca a imagem
  - Leis: resumo + link do PDF, nunca o inteiro teor
  - Eleições: só agregados usados na tela (Brasil + UF por candidato), nunca por seção
  - Job semanal registra `pg_size_pretty(pg_database_size(current_database()))` e alerta acima de 400 MB

### Site: Vercel
- Região das funções igual à do banco (Supabase em us-east-1, North Virginia):
  ```json
  // vercel.json
  { "regions": ["iad1"] }
  ```
- Build:
  ```json
  "scripts": {
    "postinstall": "prisma generate",
    "build": "prisma migrate deploy && next build"
  }
  ```
- PrismaClient singleton em `src/lib/db.ts`:
  ```ts
  import { PrismaClient } from "@prisma/client";
  const g = globalThis as unknown as { prisma?: PrismaClient };
  export const db = g.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") g.prisma = db;
  ```
- Nenhuma página consulta o banco a cada visita. ISR por seção:

  | Página | `revalidate` |
  |---|---|
  | Leis e votações | 3600 |
  | Parlamentares / perfil | 86400 |
  | Impostômetro | 86400 (o contador anda no navegador) |
  | Eleições | `false` (estático) |

- Rota `POST /api/revalidate`, protegida por `Authorization: Bearer ${REVALIDATE_SECRET}`,
  recebe `{ paths: string[] }` e chama `revalidatePath` em cada um. Os jobs chamam essa rota ao terminar.
- Jobs NÃO rodam na Vercel (limite de tempo das funções).

### Jobs: GitHub Actions
- Um workflow com `on: schedule` por grupo de frequência, rodando `tsx src/jobs/<job>.ts`.
- Secrets no GitHub: `DATABASE_URL`, `REVALIDATE_SECRET`, `SITE_URL`, URLs dos CSVs.
- Variáveis na Vercel: `DATABASE_URL`, `DIRECT_URL`, `REVALIDATE_SECRET`.
- Nenhuma variável sensível com prefixo `NEXT_PUBLIC_`.
- Os jobs frequentes também mantêm o Supabase ativo; se pararem, o banco pausa. Por isso, alerta de falha é obrigatório.

### Agendamento
| Job | Frequência |
|---|---|
| Votações e proposições | de hora em hora, dias úteis |
| Despesas (Câmara e Senado) | 1x/dia |
| Lista de parlamentares | 1x/semana |
| Tamanho do banco | 1x/semana |
| Arrecadação | mensal (dia 5) |
| Eleições 2026 | carga única, rodada manualmente (workflow_dispatch) |

---

## Fontes de dados
| Seção | Fonte | Formato |
|---|---|---|
| Deputados, despesas, votações, proposições | https://dadosabertos.camara.leg.br/api/v2 | REST JSON, sem chave |
| Senadores, matérias, votações | https://legis.senado.leg.br/dadosabertos | XML/JSON (header `Accept: application/json`) |
| Verbas dos senadores (CEAPS) | Portal de transparência do Senado | CSV anual (URL em env) |
| Eleições 2026 | https://resultados.tse.jus.br/oficial/comum/config/ele-c.json | JSON; 1º e 2º turno têm códigos de eleição diferentes |
| Histórico eleitoral | Portal de Dados Abertos do TSE | CSV/ZIP, carga única (opcional) |
| Arrecadação | Receita Federal / Tesouro Nacional | CSV/planilha mensal |
| Presidentes (mandatos, partido) | Wikidata (SPARQL, `P39` = Q5176750) | JSON, carga única; confirmar a Galeria de Presidentes da Biblioteca da Presidência |

Endpoints principais da Câmara:
```
GET /deputados
GET /deputados/{id}/despesas?ano=2026
GET /votacoes?dataInicio=...&dataFim=...
GET /votacoes/{id}/votos
GET /votacoes/{id}/orientacoes
GET /proposicoes/{id}
GET /proposicoes/{id}/autores
```

**Impostômetro:** não existe API pública. Calcular nós mesmos:
- valor = base oficial acumulada + taxa por segundo × tempo decorrido
- meses ainda não divulgados = mesmo mês do ano anterior × crescimento médio
- exibir sempre como "estimativa", com a metodologia na página
- começar só pelos tributos federais

**Resumo das leis:**
- padrão: campo `ementa` oficial
- opcional: resumo por LLM, gerado UMA vez na ingestão a partir do inteiro teor, salvo no banco
  e exibido com o selo "Gerado por IA"

---

## Arquitetura
```
src/
  lib/
    db.ts
    sources/{camara,senado,tse,receita}/   → client.ts + adapter.ts + schemas.ts (Zod)
  jobs/                                    → sync-*.ts, um por domínio
  app/
    api/                                   → API interna + /api/revalidate
    (site)/                                → páginas
  components/                              → UI
.github/workflows/                         → agendamento dos jobs
```

Regras:
- Um adapter por fonte converte o formato externo para o nosso modelo.
- Tabela única `Parlamentar` com `casa: CAMARA | SENADO`.
- Todo sync é idempotente: upsert com chave única, pode rodar N vezes sem duplicar.
- Despesas da Câmara vêm com duplicatas na origem: deduplicar por hash dos campos.
- Votação simbólica não tem votos nominais: é um estado próprio, não uma lista vazia.
- Retry com backoff exponencial em 5xx/429. Paginação seguindo o link `next`.
- Falha de job: log estruturado + alerta. Coluna renomeada na fonte deve quebrar a validação Zod, nunca gravar dado errado.
- URLs de CSV em variáveis de ambiente.
- "Virou lei" = proposição transformada em norma jurídica. Votação aprovada numa casa não é lei.

---

## Design (mockup aprovado)
- Fonte: IBM Plex Sans; números com `font-variant-numeric: tabular-nums`
- Fundo `#F5F5F2` · superfície `#FFFFFF` · texto `#15171C` · secundário `#5A606B` · borda `#E3E3DE`
- Destaque único: azul-marinho `#1D3F6E` (item ativo: fundo `#E8EEF6`)
- Votos: Sim `#2459A6` (azul) · Não `#C05A1F` (laranja) · Abstenção `#B4B8BF`
  (azul × laranja de propósito, para ser acessível a daltônicos)
- Cards com borda de 1px e raio de 12px; sem sombras pesadas, sem gradientes
- Sidebar fixa de 248px; no mobile empilha acima do conteúdo
- Alvos de toque ≥ 44px; contraste de texto ≥ 4.5:1

## Telas
1. **Impostômetro**: contador grande animado, filtro por esfera (Total/Federal/Estadual/Municipal),
   KPIs (hoje, mês, por habitante, variação real), barras mensais (último mês "estimado" com cor mais clara),
   barras por tributo, bloco de metodologia
2. **Parlamentares**: alternância Câmara/Senado, busca + filtros (UF, partido, ordenação), KPIs,
   tabela ranqueada por gasto com mini-barra, paginação
3. **Perfil do parlamentar**: cabeçalho, KPIs (cota usada × limite, notas, presença, proposições),
   gasto por categoria, gasto por mês, tabela de despesas com link "Ver nota"
4. **Leis e votações**: abas (Todas, Viraram lei, Aprovadas na Câmara, Aprovadas no Senado, Rejeitadas),
   cards com status, código, título, resumo, autor e placar em barra empilhada (ou "votação simbólica")
5. **Detalhe da lei**: resumo, ementa oficial, linha do tempo da tramitação, resultado, autoria,
   tabela de voto por partido, grade de votos nominais filtrável
6. **Eleições**: filtros de cargo e UF, KPIs de comparecimento 1º → 2º turno, finalistas com barras
   dos dois turnos, quem ficou fora do 2º turno, tabela por UF destacando "virada"
7. **História do país**: linha do tempo 1889–2026 colorida por período (República Velha, Era Vargas,
   República de 1946, Regime militar, Nova República), lista de presidentes agrupada por período,
   cartão do presidente (mandato, duração, partido, fontes). Realizações e críticas por IA: a decidir
   (ver Etapa 8)

---

## Roteiro de etapas
1. **Fundação**: Next.js + Prisma + Supabase, schema completo (Parlamentar, Despesa, Proposicao, Autor,
   Votacao, Voto, OrientacaoPartido, Eleicao, ResultadoCandidato, Arrecadacao), migration de RLS, `lib/db.ts`
2. **Câmara: deputados e despesas**: client + adapter + jobs, com deduplicação e testes do adapter
3. **UI base**: layout com sidebar + telas Parlamentares e Perfil, com ISR
4. **Câmara: votações e proposições** + telas Leis e Detalhe da lei
5. **Senado**: API de votações + CSV do CEAPS
6. **Eleições 2026**: ingestão do JSON do TSE + tela de comparação
7. **Impostômetro**: job de arrecadação, cálculo da projeção, contador
8. **História do país**: carga única do Wikidata (mandatos, partido) + tela de linha do tempo.
   Pendente de decisão antes de codar: texto de contexto/realizações/críticas (IA × só dados
   estruturados), origem de "chegada ao poder", "saída" e vice (o Wikidata não traz de forma confiável)
   e a tabela de períodos históricos
9. **Operação**: workflows do GitHub Actions, `/api/revalidate`, alertas de falha, job de tamanho do banco, deploy na Vercel

## Como trabalhar comigo
- Antes de codar uma etapa, mostre o plano (arquivos, modelos, decisões) e espere meu ok.
- Uma etapa por vez. Ao terminar: o que foi feito, como testar, o que ficou pendente.
- Antes de escrever um adapter, chame o endpoint real para confirmar os campos. Não suponha o formato.
- Sem dados mockados no código final; seeds só para desenvolvimento local.
- Não instale dependências fora da stack sem me perguntar.
