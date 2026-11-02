# Operação: jobs, deploy e alertas

Como o site se mantém atualizado sozinho. Nenhum segredo vai para o git: tudo é cadastrado nos painéis do GitHub e da Vercel.

## Visão geral

```
GitHub Actions (cron) ──► jobs gravam no Supabase ──► POST /api/revalidate ──► Vercel serve páginas novas
        │ falhou?
        └──► abre uma issue no repositório (o GitHub avisa por e-mail)
```

## Workflows (`.github/workflows/`)

| Workflow | Quando (horário de Brasília) | O que roda |
|---|---|---|
| `votacoes.yml` | de hora em hora, 8h–20h, seg–sex | votações da Câmara e do Senado (últimos 2 dias) |
| `diario.yml` | todo dia, 3h | despesas da Câmara, CEAPS, proposições da Câmara e do Senado |
| `semanal.yml` | domingo, 4h | deputados, senadores, tamanho do banco |
| `mensal.yml` | dia 5, 6h | arrecadação federal e estadual, orçamento, detalhe federal por tributo, receita estadual bruta por imposto (DCA) |
| `carga-unica.yml` | só manual | `sync-eleicoes` ou `sync-presidentes` (escolhido na hora) |

- Todos têm `workflow_dispatch`: Actions → escolher o workflow → **Run workflow**.
- Cada workflow roda os jobs em sequência. Um job que falha não impede os seguintes, mas a atualização das páginas só acontece se **tudo** deu certo.
- `concurrency` impede dois jobs do mesmo workflow ao mesmo tempo.
- Os horários do cron são em UTC (Brasília = UTC−3).
- O GitHub **desativa workflows agendados** em repositório sem atividade por 60 dias. Se isso acontecer, reative em Actions.

## Segredos e variáveis

Cadastre em **Settings → Secrets and variables → Actions**.

| Nome | Tipo | Valor | Onde mais |
|---|---|---|---|
| `DATABASE_URL` | Secret | `DATABASE_URL` do seu `.env` (pooler, porta 6543) | Vercel |
| `REVALIDATE_SECRET` | Secret | gere com `openssl rand -hex 32` | Vercel, **mesmo valor** |
| `SITE_URL` | Secret | URL do site na Vercel, sem barra no fim (depois do primeiro deploy) | |
| `CAMARA_DESPESAS_CSV_URL` | Variable (ou Secret) | do seu `.env` | |
| `SENADO_CEAPS_URL` | Variable (ou Secret) | do seu `.env` | |
| `RECEITA_ANALISE_URL` | Variable (ou Secret) | do seu `.env` | |

Pelo terminal, lendo do `.env` sem expor o valor: `gh secret set DATABASE_URL < <(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')`.

Na **Vercel** (Project → Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `REVALIDATE_SECRET`. Nenhuma variável sensível com prefixo `NEXT_PUBLIC_`.

Enquanto `SITE_URL` não existir, o passo "Atualizar páginas" só registra um aviso e o workflow continua verde. **Depois do deploy, cadastre `SITE_URL`**: sem ele, as páginas só mostram dado novo no próximo deploy.

## Atualização das páginas: `POST /api/revalidate`

- Exige `Authorization: Bearer <REVALIDATE_SECRET>` (comparado em tempo constante). Sem segredo configurado, recusa tudo.
- Corpo: `{ "paths": ["/leis", "/leis/proposicao/[id]"] }`. Só aceita os caminhos de `CAMINHOS_PERMITIDOS` (`src/lib/revalidar.ts`); qualquer outro vira 400.
- Caminho com `[param]` revalida todas as páginas daquele padrão.
- Respostas: 200 ok, 400 caminho ou corpo inválido, 401 não autorizado.
- Os workflows chamam `src/jobs/revalidar.ts`, que falha (e dispara o alerta) se a rota não responder 200.

Testar à mão:
```bash
curl -i -X POST "$SITE_URL/api/revalidate" \
  -H "Authorization: Bearer $REVALIDATE_SECRET" -H "Content-Type: application/json" \
  -d '{"paths":["/orcamento"]}'
```

## Alertas de falha

Quando qualquer passo falha, o workflow abre uma issue **"Falha no workflow: <nome>"** com o link da execução. Se já houver uma aberta com esse título, comenta nela em vez de abrir outra. Feche a issue depois de resolver.

Para receber e-mail: GitHub → Settings → Notifications, e "Watch" no repositório (pelo menos "Issues").

**Por que isso importa:** o Supabase grátis pausa o banco após 1 semana sem atividade. Os jobs frequentes o mantêm ativo, então um workflow parado por dias é um risco real.

## Tamanho do banco

`npm run job:tamanho-banco` (roda no `semanal.yml`) registra o tamanho e **falha acima de 400 MB** (o plano grátis tem 500 MB). A falha abre a issue de alerta. Se acontecer: veja `pg_total_relation_size` por tabela e reduza o que mais pesa (despesas são só da legislatura atual).

## Deploy na Vercel

1. Importe o repositório do GitHub na Vercel.
2. Cadastre as variáveis acima na Vercel.
3. O `vercel.json` já fixa a região `iad1` (a mesma do banco). O `build` roda `prisma migrate deploy && next build`.
4. Depois do primeiro deploy, cadastre `SITE_URL` no GitHub e rode **Mensal** à mão para popular e revalidar.
5. Primeira carga em banco novo, nesta ordem: `sync-deputados`, `sync-senadores`, `sync-despesas`, `sync-ceaps`, `sync-votacoes` (com `--desde` do início da legislatura), `sync-votacoes-senado`, `sync-proposicoes`, `sync-proposicoes-senado`, `sync-arrecadacao`, `sync-arrecadacao-estados`, `sync-orcamento`, e pelo workflow **Carga única**: `sync-eleicoes` e `sync-presidentes`.

## Rodando um job localmente

```bash
npm run sync:orcamento          # usa o .env
npm run job:tamanho-banco
SITE_URL=https://seu-site REVALIDATE_SECRET=... npm run job:revalidar -- /orcamento
```
