# De Olho na República — contexto do projeto

## O que é
Site de transparência política com 5 seções na sidebar:
1. **Impostômetro**: contador em tempo real da arrecadação de tributos em 2026
2. **Parlamentares**: deputados e senadores, com gastos da cota parlamentar, notas fiscais e presença
3. **Leis e votações**: o que foi votado, quem propôs, resumo e como cada parlamentar votou
4. **Eleições 2026**: resultados do TSE e comparação entre 1º e 2º turno
5. **História do país**: linha do tempo dos presidentes da República desde 1889, por período
6. **Orçamento**: despesa da União por função de governo (executado × previsto), com subfunções

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
  | Orçamento | 86400 |
  | História do país | `false` (carga única) |

- Rota `POST /api/revalidate`, protegida por `Authorization: Bearer ${REVALIDATE_SECRET}`,
  recebe `{ paths: string[] }` e chama `revalidatePath` em cada um. Os jobs chamam essa rota ao terminar.
- Jobs NÃO rodam na Vercel (limite de tempo das funções).

### Jobs: GitHub Actions
- Um workflow com `on: schedule` por grupo de frequência, rodando `tsx src/jobs/<job>.ts`.
- Secrets no GitHub: `DATABASE_URL`, `REVALIDATE_SECRET`, `SITE_URL`, URLs dos CSVs.
- Variáveis na Vercel: `DATABASE_URL`, `DIRECT_URL`, `REVALIDATE_SECRET`, `PIX_COPIA_E_COLA`, `APOIE_AUTOR` (as duas últimas só para a página /apoie).
- Nenhuma variável sensível com prefixo `NEXT_PUBLIC_`.
- Os jobs frequentes também mantêm o Supabase ativo; se pararem, o banco pausa. Por isso, alerta de falha é obrigatório.

### Agendamento
| Job | Frequência |
|---|---|
| Votações (Câmara e Senado, janela de 2 dias) | de hora em hora, 8h–20h de Brasília, dias úteis |
| Proposições (situação e data da lei) | 1x/dia (reconsulta todas as pendentes, ~6 min) |
| Despesas (Câmara e Senado) | 1x/dia (3h de Brasília) |
| Lista de parlamentares | 1x/semana |
| Tamanho do banco | 1x/semana |
| Arrecadação | mensal (dia 5) |
| Arrecadação estadual (Siconfi, RREO) | mensal |
| Detalhe federal por tributo (Receita, Tabelas I e VII) | mensal |
| Receita estadual bruta por imposto (Siconfi, DCA anual) | mensal (só traz dado novo quando a DCA do ano sai, ~abril) |
| Orçamento da União (Siconfi) | mensal (o RREO sai a cada bimestre) |
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
| Arrecadação federal | Receita Federal, relatório mensal "Análise da Arrecadação" (PDF): Tabela III (série mensal por categoria), Tabela I (por tributo, 3 colunas: mês, mês anterior, mesmo mês do ano anterior) e Tabela VII (por base de incidência, anual) | PDF mensal, lido com `pdftotext` |
| Arrecadação estadual, líquida | Siconfi, `rreo` Anexo 01, 27 estados | REST JSON, bimestral, **líquida** de repasses a municípios e FUNDEB |
| Receita estadual, bruta por imposto | Siconfi, `dca` com `no_anexo=DCA-Anexo I-C` (ICMS, IPVA, ITCMD, IR retido, taxas, com 3 colunas de dedução) | REST JSON, **anual** (a do ano N sai por volta de abril de N+1) |
| Orçamento da União (função/subfunção) | Siconfi, `rreo` com `no_anexo=RREO-Anexo 02` e `id_ente=1` | REST JSON, bimestral, acumulado no ano |
| Presidentes (mandatos, partido, foto) | Wikidata (SPARQL, `P39` = Q5176750; foto = `P18`) | JSON, carga única; confirmar a Galeria de Presidentes da Biblioteca da Presidência |
| Foto do presidente: autor e licença | Wikimedia Commons, API `action=query&prop=imageinfo` (`extmetadata`) | JSON; só o endereço da miniatura é guardado, nunca a imagem |

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
- esferas: Federal (Receita, mensal) e Estadual (Siconfi/RREO, bimestral, por UF). Total = Federal + Estadual
- NÃO incluir Municipal: o RREO municipal sai incompleto (~60% dos municípios, ~90% da população, numa amostra
  de 40) e exige 5.570 chamadas por bimestre. Um total parcial seria lido como o total do país. Só reavaliar com
  dado completo (a DCA anual do Tesouro já é usada para os estados; a municipal não foi sondada)
- dados oficiais e projeção ficam em blocos separados; o contador é sempre rotulado "projeção"
- **Bruto × líquido (decisão da Etapa 7+):** o Federal é BRUTO. O Estadual do RREO é LÍQUIDO das deduções
  (repasses constitucionais aos municípios, FUNDEB e outras), e cada estado contabiliza as deduções de um jeito
  (nacional 2025: R$ 805 bi no RREO contra R$ 1.155 bi brutos na DCA). Por isso: o RREO é rotulado "líquido de
  repasses" na tela; o bruto por imposto vem da DCA, em bloco próprio (anual); e o Total soma Federal bruto +
  Estadual líquido, com esse rótulo. DCA líquida = RREO acumulado do ano em 26 dos 27 estados (RJ difere ~R$ 2,5 bi;
  o job só registra aviso). O CONFAZ (boletim do ICMS por estado e mês) NÃO serve: parou em maio/2019
- categorias por base de incidência usam a taxonomia da Receita (renda e propriedade, folha de salários, bens e
  serviços, transações financeiras, outros): Federal pela Tabela VII; Estadual derivado da DCA (IPVA, ITCMD e IR
  retido em renda e propriedade; ICMS em bens e serviços; taxas em outros)

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
- Sidebar fixa de 248px; no celular (até 800px) vira barra no topo com botão de hambúrguer e o menu abre como gaveta
  lateral (fecha ao navegar, com Esc, no fundo escurecido e no X; o foco fica preso na gaveta enquanto aberta)
- Alvos de toque ≥ 44px; contraste de texto ≥ 4.5:1

## Telas
1. **Impostômetro** (decisão: a projeção é a primeira coisa que o visitante vê; o resto é resumo ou fica recolhido):
   esfera (Total/Federal/Estadual) no topo; "Filtrar por estado" recolhido (só na aba Estadual, com o resumo
   "N de 27 estados" visível); **contador de projeção em destaque** (rotulado "Projeção", taxa por
   segundo, hoje, mês corrente, ano decorrido; "Como é calculado" recolhido); **"Dado oficial"** resumido (recorte
   mês/bimestre/acumulado, abrindo em "Acumulado no ano"; total, variação nominal sobre o ano anterior, por habitante,
   gráfico por período e os 5 maiores tributos); seções recolhidas: "Detalhe por tributo e por imposto" (Federal
   mensal e bruto, Estadual anual e bruto, por base de incidência) e "Como o valor é calculado e de onde vêm os dados"
   (metodologia, com o aviso de bruto × líquido). Sem filtro de tributo na tela de entrada (a árvore do detalhe o substitui)
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
   cartão do presidente (foto com crédito, períodos no cargo, duração, partido ou filiações, fontes).
   Sem texto de IA, sem chegada/saída/vice (decisão da Etapa 8)
8. **Apoie o projeto** (`/apoie`): QR code e "Pix copia e cola" para doação, texto honesto de que o dinheiro vai para o autor
   (sem contrapartida, sem influência nos dados). O código Pix é o ESTÁTICO gerado pelo banco (chave aleatória), lido da
   variável `PIX_COPIA_E_COLA` (mais `APOIE_AUTOR` para o nome do texto): nada disso vai ao git (repo público). `lib/pix.ts`
   só VALIDA o código (CRC16, QR estático, sem valor fixo, conta br.gov.bcb.pix) e o build FALHA se for inválido; sem a
   variável a página e o link do menu não existem. QR gerado no servidor com `qrcode` (SVG). Variáveis também na Vercel

---

7b. **Orçamento da União** (pronto): `npm run sync:orcamento`, tabela `DespesaFuncao`, tela `/orcamento`.
   Só a União (estados/municípios ficam de fora). Valores = despesa liquidada acumulada até o último bimestre
   publicado; "Encargos Especiais" (dívida e transferências) é ~40% do total e vem com aviso. O adapter confere
   que subfunções somam a função e funções somam o total, e falha se a estrutura da fonte mudar. A lista de
   funções em `siconfi/orcamento.ts` é a classificação funcional oficial (Portaria MOG 42/1999).

## Roteiro de etapas
1. **Fundação**: Next.js + Prisma + Supabase, schema completo (Parlamentar, Despesa, Proposicao, Autor,
   Votacao, Voto, OrientacaoPartido, Eleicao, ResultadoCandidato, Arrecadacao), migration de RLS, `lib/db.ts`
2. **Câmara: deputados e despesas**: client + adapter + jobs, com deduplicação e testes do adapter
3. **UI base**: layout com sidebar + telas Parlamentares e Perfil, com ISR
4. **Câmara: votações e proposições** + telas Leis e Detalhe da lei
5. **Senado**: API de votações + CSV do CEAPS
6. **Eleições 2026**: ingestão do JSON do TSE + tela de comparação
7. **Impostômetro**: job de arrecadação, cálculo da projeção, contador
8. **História do país** (pronta): carga única do Wikidata (`npm run sync:presidentes`) + tela `/historia`.
   Decisões: só dados estruturados (sem IA); sem chegada/saída/vice (Wikidata não traz de forma confiável);
   períodos = tabela fixa em `src/lib/historia.ts`, por data de início do mandato; 36 pessoas (juntas de
   1930 e 1969 não são pessoas no Wikidata e ficam fora, com aviso na tela); mandatos seguidos da mesma
   pessoa são juntados; o Wikidata não data a filiação por mandato, então 1 partido = "Partido" e vários =
   "Filiações ao longo da vida". Fotos: Wikidata P18 + autor e licença do Commons (36 de 36: 28 domínio público,
   8 Creative Commons); a foto só entra com licença conhecida e sem restrição declarada; o crédito (autor ou
   "autor desconhecido", licença e link do Commons) fica sempre visível no cartão; a classificação de licença é a do
   Commons, não conferência nossa; imagens via `next/image` (só `thumb.wikimedia.org` e `upload.wikimedia.org`)
9. **Operação** (código pronto; falta cadastrar segredos e fazer o deploy): workflows em `.github/workflows` (votacoes, diario, semanal, mensal, carga-unica), `POST /api/revalidate` com lista fixa de caminhos, alerta de falha por issue do GitHub, job `tamanho-banco` (falha acima de 400 MB). Passo a passo em `docs/OPERACAO.md`

## Como trabalhar comigo
- Antes de codar uma etapa, mostre o plano (arquivos, modelos, decisões) e espere meu ok.
- Uma etapa por vez. Ao terminar: o que foi feito, como testar, o que ficou pendente.
- Antes de escrever um adapter, chame o endpoint real para confirmar os campos. Não suponha o formato.
- Sem dados mockados no código final; seeds só para desenvolvimento local.
- Não instale dependências fora da stack sem me perguntar.
