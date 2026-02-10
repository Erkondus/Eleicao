# Guia de Atualizacao - SimulaVoto no Portainer

Este guia explica como atualizar uma instalacao existente do SimulaVoto em ambiente Portainer.

---

## Antes de Atualizar

### 1. Verificar Versao Atual

```bash
cd /opt/simulavoto
git log -1 --oneline
```

### 2. Backup do Banco de Dados

**IMPORTANTE**: Sempre faca backup antes de atualizar!

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Verificar Espaco em Disco

```bash
df -h
# Certifique-se de ter pelo menos 2GB livres
```

---

## Metodos de Atualizacao

### Atualizacao Rapida (Apenas Codigo)

Use este metodo quando nao ha mudancas no banco de dados:

```bash
cd /opt/simulavoto
git fetch origin && git pull origin main
docker compose up -d --build
docker compose logs -f --tail=30 simulavoto
```

O processo leva aproximadamente 2-3 minutos.

---

### Metodo 1: Via SSH (Recomendado)

#### 1.1 Parar Aplicacao

```bash
cd /opt/simulavoto
docker compose down
```

#### 1.2 Baixar Atualizacoes

```bash
git fetch origin
git pull origin main
```

#### 1.3 Verificar Variaveis de Ambiente

Consulte a secao [Variaveis de Ambiente](#variaveis-de-ambiente) abaixo.

**IMPORTANTE**: Certifique-se de usar a URL do **Connection Pooler** (porta 6543):
```bash
nano .env
# DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
```

#### 1.4 Rebuild e Deploy

```bash
docker compose up -d --build
```

#### 1.5 Verificar Status

```bash
docker compose logs -f
# Ctrl+C para sair
```

---

### Metodo 2: Via Portainer UI

#### 2.1 Acessar Stack

1. Abra o Portainer
2. Va em **Stacks** -> **simulavoto**

#### 2.2 Pull das Atualizacoes

1. Clique em **Editor**
2. Use **Stack actions** -> **Pull and redeploy**

#### 2.3 Verificar Variaveis de Ambiente

1. Va na aba **Environment variables**
2. Verifique que `DATABASE_URL` usa porta **6543** (Connection Pooler)
3. Adicione novas variaveis se necessario

#### 2.4 Redeploy

1. Clique em **Update the stack**
2. Marque **Re-pull image and redeploy** se usando imagem do registry
3. Clique em **Update**

#### 2.5 Verificar Logs

1. Va em **Containers**
2. Clique no container **simulavoto**
3. Va em **Logs**

---

## Variaveis de Ambiente

### Janeiro 2026

Nenhuma nova variavel obrigatoria foi adicionada:

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL (usar Connection Pooler porta 6543) |
| `SESSION_SECRET` | Sim | Segredo para sessoes (32+ chars) |
| `OPENAI_API_KEY` | Nao* | Chave API do OpenAI |
| `NODE_ENV` | Nao | Ambiente (`production`) |
| `PORT` | Nao | Porta (padrao: 5000) |
| `RESEND_API_KEY` | Nao | Para envio de emails |

*A chave OpenAI e necessaria para recursos de IA.

---

## Novos Recursos e Correcoes (Janeiro 2026)

### Atualizacoes de Seguranca

| Pacote | Versao Anterior | Versao Nova | Correcao |
|--------|-----------------|-------------|----------|
| `express` | 4.21.2 | 4.21.3+ | Vulnerabilidade em body-parser/qs |
| `qs` | < 6.14.1 | 6.14.1+ | DoS via memory exhaustion |
| `body-parser` | 1.x | 2.2.2 | Vulnerabilidades de parsing |

### Otimizacoes de Performance (CPU)

1. **Simulacoes Eleitorais**: Limite de 5 simultaneas, timeout de 10min
2. **Busca Semantica**: Eliminacao de queries N+1, consultas em batch
3. **Processamento CSV**: Yield points para event loop

### Correcao de Bug Critico - Import 2014

**Problema**: Imports de CANDIDATO 2014 falhavam com erro `INTEGER overflow`
**Solucao**: Mapeamento correto das colunas do CSV Legacy (38 colunas) vs Modern (50 colunas)

### Formatos CSV TSE Suportados

| Tipo | Formato | Anos | Colunas |
|------|---------|------|---------|
| CANDIDATO | Legacy | 2002-2014 | 38 |
| CANDIDATO | Modern | 2018-2022+ | 50 |
| PARTIDO | Legacy | ate 2010 | ate 23 |
| PARTIDO | Intermediate | 2002-2014 | 28 |
| PARTIDO | Modern | 2018-2022+ | 36-38 |
| DETALHE | Universal | Todos | 47 |

### Modulo de Gerenciamento de Campanhas

1. **Gestao de Equipe**: Adicionar/remover membros com funcoes
2. **Visualizacao de Calendario**: Grade mensal com atividades
3. **Metas de KPIs**: Recomendacoes IA via GPT-4o
4. **Sistema de Notificacoes**: Alertas automaticos

---

## Migracoes de Banco de Dados

### Para instalacao LIMPA (banco novo)

Execute APENAS o `init-db.sql` no Supabase SQL Editor:

1. Acesse o Supabase Dashboard -> **SQL Editor**
2. Execute `scripts/init-db.sql` (contem todas as 68 tabelas)
3. Pronto! **Nao** execute o migration.

### Para atualizacao de banco existente

**Opcao 1: Via Drizzle (Recomendado)**
```bash
docker exec simulavoto npm run db:push
```

**Opcao 2: Via SQL no Supabase**
1. Acesse o Supabase Dashboard -> **SQL Editor**
2. Execute `scripts/migration-2026-01.sql`
3. **Se houver erros de colunas**, execute tambem `scripts/fix-all-columns-production.sql`

---

## Verificacao Pos-Atualizacao

### 1. Health Check

```bash
curl http://localhost:5000/api/health
# Deve retornar: {"status":"ok"}
```

### 2. Verificar Logs

```bash
docker compose logs --tail=50 simulavoto
```

Deve mostrar:
```
Database pool initialized successfully
Routes registered successfully!
Server running on port 5000
```

### 3. Testar Funcionalidades

1. Acesse a aplicacao
2. Faca login como admin
3. Va em **Campanhas**
4. Verifique as novas abas: **Equipe**, **Calendario**, **Metas KPI**

---

## Rollback (Reverter Atualizacao)

Se algo der errado:

### 1. Parar Container

```bash
docker compose down
```

### 2. Reverter para Versao Anterior

```bash
git log --oneline -10
git checkout <commit_hash>
```

### 3. Rebuild

```bash
docker compose up -d --build
```

### 4. Restaurar Backup do Banco (se necessario)

```bash
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

---

## Troubleshooting

### Erro: network not found

**Causa**: docker-compose antigo referenciava rede `supabase_default`
**Solucao**: Atualize o docker-compose.yaml (versao atual nao usa redes externas):
```bash
git pull
docker compose down
docker compose up -d --build
```

### Erro: ENETUNREACH (IPv6)

**Causa**: DNS retorna apenas IPv6 e container nao tem conectividade IPv6
**Solucao**: Use a URL do **Connection Pooler** (porta 6543):
```
postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Erro: Conflito de Merge no Git

```bash
git fetch origin
git reset --hard origin/main
```

### Erro: Container nao inicia

```bash
docker compose logs simulavoto
docker compose build --no-cache
docker compose up -d
```

### Erro: Porta ja em uso

```bash
netstat -tlnp | grep 5000
# Parar processo conflitante ou mudar PORT no .env
```

---

## Checklist de Atualizacao

### Atualizacao Janeiro 2026

- [ ] Backup do banco realizado
- [ ] Espaco em disco verificado (>2GB)
- [ ] `DATABASE_URL` usa Connection Pooler (porta 6543)
- [ ] `git pull` executado
- [ ] `docker compose up -d --build` executado
- [ ] Health check passando (`curl localhost:5000/api/health`)
- [ ] Testar import TSE 2014 (CANDIDATO) - deve funcionar sem erro overflow
- [ ] Monitorar CPU durante imports grandes (deve permanecer estavel)
- [ ] Login funcionando
- [ ] Funcionalidades de IA operacionais (se OPENAI_API_KEY configurada)
