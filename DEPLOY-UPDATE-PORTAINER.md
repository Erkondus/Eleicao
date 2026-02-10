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
docker exec simulavoto-db pg_dump -U simulavoto simulavoto > backup_$(date +%Y%m%d_%H%M%S).sql
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

> **Nota**: Os dados do banco sao preservados no volume Docker `simulavoto_pgdata`.

#### 1.2 Baixar Atualizacoes

```bash
git fetch origin
git pull origin main
```

#### 1.3 Verificar Variaveis de Ambiente

Consulte a secao [Variaveis de Ambiente](#variaveis-de-ambiente) abaixo.

```bash
nano .env
# Verifique que POSTGRES_PASSWORD, SESSION_SECRET e OPENAI_API_KEY estao configurados
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
2. Verifique que `POSTGRES_PASSWORD`, `SESSION_SECRET` e `OPENAI_API_KEY` estao configurados

#### 2.4 Redeploy

1. Clique em **Update the stack**
2. Marque **Re-pull image and redeploy** se usando imagem do registry
3. Clique em **Update**

#### 2.5 Verificar Logs

1. Va em **Containers**
2. Clique no container **simulavoto**
3. Va em **Logs**

---

## Migracao de Supabase para Banco Local

Se voce estava usando Supabase e quer migrar para banco local:

### 1. Exportar dados do Supabase

```bash
pg_dump "postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres" > supabase_export.sql
```

### 2. Atualizar para versao com banco local

```bash
cd /opt/simulavoto
git pull origin main
```

### 3. Atualizar .env

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=SuaSenhaSegura2026!
SESSION_SECRET=SEU_SESSION_SECRET_EXISTENTE
OPENAI_API_KEY=sk-sua-chave-aqui
EOF
```

> **Nota**: Remova `DATABASE_URL` do .env - ela agora e gerada automaticamente pelo docker-compose.

### 4. Subir containers

```bash
docker compose up -d --build
```

### 5. Importar dados do Supabase

```bash
docker exec -i simulavoto-db psql -U simulavoto simulavoto < supabase_export.sql
```

### 6. Reiniciar aplicacao

```bash
docker compose restart simulavoto
```

---

## Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `POSTGRES_PASSWORD` | Sim | Senha do PostgreSQL local |
| `SESSION_SECRET` | Sim | Segredo para sessoes (32+ chars) |
| `OPENAI_API_KEY` | Nao* | Chave API do OpenAI |
| `RESEND_API_KEY` | Nao | Para envio de emails |

> **Nota**: `DATABASE_URL`, `NODE_ENV` e `PORT` sao configurados automaticamente pelo docker-compose.

*A chave OpenAI e necessaria para recursos de IA.

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

### 3. Verificar Banco

```bash
docker exec simulavoto-db pg_isready -U simulavoto -d simulavoto
```

### 4. Testar Funcionalidades

1. Acesse a aplicacao
2. Faca login como admin
3. Verifique importacoes IBGE e TSE

---

## Rollback (Reverter Atualizacao)

Se algo der errado:

### 1. Parar Containers

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
docker exec -i simulavoto-db psql -U simulavoto simulavoto < backup_YYYYMMDD_HHMMSS.sql
```

---

## Troubleshooting

### Erro: Container nao inicia

```bash
docker compose logs simulavoto
docker compose logs db
```

### Erro: Banco nao conecta

```bash
docker exec simulavoto-db pg_isready -U simulavoto -d simulavoto
docker compose restart db
```

### Erro: Conflito de Merge no Git

```bash
git fetch origin
git reset --hard origin/main
```

### Erro: Porta ja em uso

```bash
netstat -tlnp | grep 5000
netstat -tlnp | grep 5433
```

---

## Checklist de Atualizacao

- [ ] Backup do banco realizado
- [ ] Espaco em disco verificado (>2GB)
- [ ] `POSTGRES_PASSWORD` configurado no .env
- [ ] `git pull` executado
- [ ] `docker compose up -d --build` executado
- [ ] Containers saudaveis (`docker compose ps`)
- [ ] Health check passando (`curl localhost:5000/api/health`)
- [ ] Login funcionando
- [ ] Dados preservados apos atualizacao
