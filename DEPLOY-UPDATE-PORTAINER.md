# Guia de Atualização - SimulaVoto no Portainer

Este guia explica como atualizar uma instalação existente do SimulaVoto em ambiente Portainer.

---

## Antes de Atualizar

### 1. Verificar Versão Atual

```bash
# No servidor via SSH
cd /opt/simulavoto  # ou diretório onde está instalado
git log -1 --oneline
```

### 2. Backup do Banco de Dados

**IMPORTANTE**: Sempre faça backup antes de atualizar!

```bash
# Via pg_dump (recomendado)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Ou via Supabase Dashboard
# Vá em Settings → Database → Backups
```

### 3. Verificar Espaço em Disco

```bash
df -h
# Certifique-se de ter pelo menos 2GB livres
```

---

## Métodos de Atualização

### Método 1: Via SSH (Recomendado)

#### 1.1 Parar Aplicação

```bash
cd /opt/simulavoto
docker compose down
```

#### 1.2 Baixar Atualizações

```bash
git fetch origin
git pull origin main
```

#### 1.3 Verificar Novas Variáveis de Ambiente

Consulte a seção [Novas Variáveis](#novas-variáveis-de-ambiente) abaixo.

Se houver novas variáveis, edite o `.env`:
```bash
nano .env
# Adicione as novas variáveis conforme necessário
```

#### 1.4 Rebuild e Deploy

```bash
docker compose up -d --build
```

#### 1.5 Executar Migrações do Banco

```bash
# Aguarde o container iniciar (30 segundos)
docker exec simulavoto npm run db:push
```

#### 1.6 Verificar Status

```bash
docker compose logs -f
# Ctrl+C para sair
```

---

### Método 2: Via Portainer UI

#### 2.1 Acessar Stack

1. Abra o Portainer
2. Vá em **Stacks** → **simulavoto**

#### 2.2 Pull das Atualizações

1. Clique em **Editor**
2. Role até encontrar **Pull and redeploy**
3. Ou use **Stack actions** → **Pull and redeploy**

#### 2.3 Verificar Variáveis de Ambiente

1. Vá na aba **Environment variables**
2. Adicione novas variáveis se necessário (consulte seção abaixo)

#### 2.4 Redeploy

1. Clique em **Update the stack**
2. Marque **Re-pull image and redeploy** se usando imagem do registry
3. Clique em **Update**

#### 2.5 Verificar Logs

1. Vá em **Containers**
2. Clique no container **simulavoto**
3. Vá em **Logs**

---

## Novas Variáveis de Ambiente

### Versão Janeiro 2026 (Módulo de Campanhas Avançado)

Nenhuma nova variável obrigatória foi adicionada. As variáveis existentes continuam funcionando:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL |
| `SESSION_SECRET` | Sim | Segredo para sessões (32+ chars) |
| `OPENAI_API_KEY` | Não* | Chave API do OpenAI |
| `NODE_ENV` | Não | Ambiente (`production`) |
| `PORT` | Não | Porta (padrão: 5000) |
| `RESEND_API_KEY` | Não | Para envio de emails |

*A chave OpenAI é necessária para recursos de IA como:
- Recomendações de KPIs
- Análise de sentimento
- Previsões eleitorais com IA
- Validação de dados com IA

---

## Novos Recursos (Janeiro 2026)

Esta atualização inclui:

### Módulo de Gerenciamento de Campanhas

1. **Gestão de Equipe**
   - Adicionar/remover membros
   - Atribuição de funções (Coordenador, Gerente, Membro, Voluntário)
   - Rastreamento de participação

2. **Visualização de Calendário**
   - Grade mensal com atividades
   - Codificação por cores por tipo (evento, reunião, marco, ação)
   - Navegação entre meses
   - Lista de próximas atividades

3. **Metas de KPIs Estratégicos**
   - Recomendações de IA via GPT-4o
   - Criação manual de metas
   - Acompanhamento de progresso
   - Níveis de prioridade

4. **Sistema de Notificações**
   - Notificações automáticas para eventos da campanha
   - Alertas de atribuição de tarefas
   - Integração com sistema de notificações in-app

### Migrações de Banco de Dados

O sistema requer novas tabelas para funcionar corretamente. Execute uma das opções:

**Opção 1: Via Drizzle (Recomendado)**
```bash
docker exec simulavoto npm run db:push
```

**Opção 2: Via SQL no Supabase**
1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `scripts/migration-2026-01.sql`
4. **Se houver erros de colunas**, execute também `scripts/fix-columns-2026-01.sql`

**Opção 3: Correção de colunas faltantes (IMPORTANTE!)**
Se o banco já tem tabelas mas com estrutura diferente, você verá erros como:
- `column "uf_nome" does not exist`
- `column "severity" does not exist`
- `column "type" does not exist`

Para corrigir:
1. Execute `scripts/fix-columns-2026-01.sql` no SQL Editor do Supabase
2. Reinicie o container: `docker compose restart simulavoto`

**Este script corrige:**
- `ibge_municipios`: Adiciona `uf_nome`, `regiao_nome`, converte `codigo_ibge` para VARCHAR(7)
- `ibge_import_jobs`: Renomeia `job_type` → `type`, `total_items` → `total_records`
- `ibge_populacao`: Renomeia `populacao_total` → `populacao`, converte `codigo_ibge` para VARCHAR(7)
- `in_app_notifications`: Adiciona `severity`, `type`, `metadata`, renomeia `read` → `is_read`
- `sentiment_analysis_results`: Adiciona `analysis_date`, `sentiment_score`, `sentiment_label`
- `sentiment_crisis_alerts`: Adiciona `alert_type`, `severity`, `title`, `description`

**Novas tabelas incluídas:**
- `in_app_notifications` - Notificações in-app
- `ibge_municipios` - Municípios do IBGE
- `ibge_populacao` - Dados de população
- `ibge_indicadores` - Indicadores socioeconômicos
- `ibge_import_jobs` - Jobs de importação IBGE
- `campaign_team_members` - Membros da equipe de campanha
- `activity_assignees` - Atribuições de atividades
- `ai_kpi_goals` - Metas de KPI com suporte IA
- `campaign_notifications` - Notificações de campanha
- E outras tabelas de análise de sentimento, dashboards, etc.

---

## Verificação Pós-Atualização

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

1. Acesse a aplicação
2. Faça login como admin
3. Vá em **Campanhas**
4. Verifique as novas abas: **Equipe**, **Calendário**, **Metas KPI**

### 4. Verificar Banco de Dados

```bash
docker exec simulavoto npm run db:push
# Deve mostrar: "All tables are up to date"
```

---

## Rollback (Reverter Atualização)

Se algo der errado:

### 1. Parar Container

```bash
docker compose down
```

### 2. Reverter para Versão Anterior

```bash
# Ver commits anteriores
git log --oneline -10

# Reverter para commit específico
git checkout <commit_hash>
```

### 3. Rebuild

```bash
docker compose up -d --build
```

### 4. Restaurar Backup do Banco (se necessário)

```bash
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

---

## Troubleshooting de Atualização

### Erro: Conflito de Merge no Git

```bash
# Descartar mudanças locais e forçar atualização
git fetch origin
git reset --hard origin/main
```

### Erro: Container não inicia após atualização

```bash
# Ver logs detalhados
docker compose logs simulavoto

# Verificar se o build foi bem-sucedido
docker compose build --no-cache
docker compose up -d
```

### Erro: Tabelas não criadas

```bash
# Forçar push do schema
docker exec simulavoto npm run db:push --force
```

### Erro: Permissão negada

```bash
# Corrigir permissões
chmod +x docker-entrypoint.sh
docker compose up -d --build
```

### Erro: Porta já em uso

```bash
# Verificar o que está usando a porta
netstat -tlnp | grep 5000

# Parar processo conflitante ou mudar porta no .env
PORT=5001
```

---

## Atualizações Automáticas (Opcional)

### Usando Watchtower

Para atualizações automáticas de containers:

```yaml
# Adicionar ao docker-compose.yaml
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 simulavoto
    restart: unless-stopped
```

### Usando Cron

```bash
# Editar crontab
crontab -e

# Adicionar job de atualização diária às 3h da manhã
0 3 * * * cd /opt/simulavoto && git pull && docker compose up -d --build >> /var/log/simulavoto-update.log 2>&1
```

---

## Checklist de Atualização

- [ ] Backup do banco realizado
- [ ] Espaço em disco verificado (>2GB)
- [ ] Novas variáveis de ambiente adicionadas
- [ ] `git pull` executado
- [ ] `docker compose up -d --build` executado
- [ ] `npm run db:push` executado
- [ ] Health check passando
- [ ] Login funcionando
- [ ] Novas funcionalidades acessíveis

---

## Suporte

Para problemas com atualização:

1. Verifique os logs: `docker compose logs simulavoto`
2. Consulte a seção de Troubleshooting
3. Verifique issues no repositório GitHub
4. Entre em contato com a equipe de suporte
