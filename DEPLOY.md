# SimulaVoto - Guia de Deploy

Este guia explica como fazer deploy do SimulaVoto com Supabase como banco de dados.

## Opcoes de Deploy

| Plataforma | Guia |
|------------|------|
| **Portainer** (Recomendado) | [DEPLOY-PORTAINER.md](./DEPLOY-PORTAINER.md) |
| **Atualizacao Portainer** | [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md) |
| **Coolify** | Este documento |
| **Docker direto** | Secao [Deploy Local com Docker](#deploy-local-com-docker) |

## Indice

1. [Pre-requisitos](#pre-requisitos)
2. [Configuracao do Supabase](#configuracao-do-supabase)
3. [Configuracao do Coolify](#configuracao-do-coolify)
4. [Variaveis de Ambiente](#variaveis-de-ambiente)
5. [Deploy Local com Docker](#deploy-local-com-docker)
6. [Comandos Uteis](#comandos-uteis)
7. [Solucao de Problemas](#solucao-de-problemas)

---

## Pre-requisitos

- Conta no [Supabase](https://supabase.com) (gratuito para comecar)
- Servidor com [Coolify](https://coolify.io) ou [Portainer](https://www.portainer.io/)
- Chave de API do OpenAI (para recursos de IA)
- Git repository com o codigo fonte

---

## Configuracao do Supabase

### 1. Criar Projeto

1. Acesse [app.supabase.com](https://app.supabase.com)
2. Clique em "New Project"
3. Configure:
   - **Nome**: SimulaVoto (ou nome de sua preferencia)
   - **Senha do Banco**: Gere uma senha forte
   - **Regiao**: Escolha a mais proxima (ex: South America - Sao Paulo)
4. Clique em "Create new project"

### 2. Habilitar Extensoes

No **SQL Editor**, execute:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Executar Script de Criacao de Tabelas

**Para instalacoes limpas**, execute APENAS o `init-db.sql`:

1. No **SQL Editor**, copie e execute o conteudo de `scripts/init-db.sql`
2. Pronto! O script contem todas as 68 tabelas.

> **Nota**: O `migration-2026-01.sql` e APENAS para atualizar bancos de versoes anteriores. Nao execute em instalacoes limpas.

### 4. Obter Connection String (Connection Pooler)

**IMPORTANTE**: Use a URL do **Connection Pooler** (porta 6543), nao a conexao direta (porta 5432).

1. Va em **Settings** -> **Database**
2. Procure **Connection Pooler**
3. Copie a URL com porta **6543**
4. Formato:
   ```
   postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

---

## Configuracao do Coolify

### 1. Adicionar Novo Projeto

1. Acesse seu dashboard do Coolify
2. Clique em **New Project**
3. Nomeie como "SimulaVoto"

### 2. Configurar Aplicacao

1. Clique em **Add New Resource** -> **Application**
2. Selecione **Docker (Build Pack)**
3. Conecte seu repositorio Git
4. Configure o branch (main/master)

### 3. Configuracoes de Build

```yaml
Build Command: npm run build
Start Command: ./docker-entrypoint.sh
Port: 5000
Health Check Path: /api/health
```

### 4. Configurar Variaveis de Ambiente

Adicione as seguintes variaveis em **Environment Variables**:

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexao PostgreSQL (Connection Pooler) | `postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | Segredo para sessoes (32+ caracteres) | `gerar-string-aleatoria-longa` |
| `OPENAI_API_KEY` | Chave API do OpenAI | `sk-...` |
| `NODE_ENV` | Ambiente | `production` |
| `PORT` | Porta da aplicacao | `5000` |

### 5. Recursos Recomendados

- **RAM**: Minimo 512MB, recomendado 1GB
- **CPU**: 0.5 vCPU minimo
- **Storage**: 1GB para logs e cache

### 6. Deploy

1. Clique em **Deploy**
2. Aguarde o build completar
3. Verifique os logs para erros
4. Acesse a URL fornecida

---

## Variaveis de Ambiente

### Obrigatorias

| Variavel | Descricao |
|----------|-----------|
| `DATABASE_URL` | Connection string do PostgreSQL/Supabase (usar Connection Pooler porta 6543) |
| `SESSION_SECRET` | String secreta para criptografia de sessoes |

### Opcionais

| Variavel | Descricao | Padrao |
|----------|-----------|--------|
| `OPENAI_API_KEY` | Para recursos de IA | - |
| `RESEND_API_KEY` | Para envio de emails | - |
| `NODE_ENV` | Ambiente de execucao | `production` |
| `PORT` | Porta do servidor | `5000` |

### Gerar SESSION_SECRET

```bash
openssl rand -base64 32
```

Ou via Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Deploy Local com Docker

### Usando Docker Compose

1. Clone o repositorio
2. Crie um arquivo `.env`:
   ```env
   DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
   SESSION_SECRET=sua-chave-secreta-aqui-32-caracteres
   OPENAI_API_KEY=sk-sua-chave-openai
   ```

3. Inicie os containers:
   ```bash
   docker compose up -d --build
   ```

4. Acesse: http://localhost:5000

### Usando Docker Apenas

1. Build da imagem:
   ```bash
   docker build -t simulavoto:latest .
   ```

2. Execute:
   ```bash
   docker run -d \
     --name simulavoto \
     -p 5000:5000 \
     --dns 8.8.8.8 \
     -e DATABASE_URL="sua-url-do-pooler" \
     -e SESSION_SECRET="sua-chave-secreta" \
     -e OPENAI_API_KEY="sk-sua-chave" \
     simulavoto:latest
   ```

---

## Comandos Uteis

### Verificar Saude da Aplicacao

```bash
curl http://localhost:5000/api/health
```

### Visualizar Logs

```bash
docker compose logs -f simulavoto
```

### Reiniciar Aplicacao

```bash
docker compose restart simulavoto
```

### Parar

```bash
docker compose down
```

### Acessar Shell do Container

```bash
docker exec -it simulavoto sh
```

---

## Solucao de Problemas

### Erro: DATABASE_URL nao definida

**Causa**: Variavel de ambiente nao configurada
**Solucao**: Verifique se `DATABASE_URL` esta definida no `.env` ou nas variaveis do Coolify/Portainer

### Erro: ENETUNREACH (IPv6)

**Causa**: O DNS retorna apenas IPv6 e o container nao tem conectividade IPv6
**Solucao**: Use a URL do **Connection Pooler** (porta 6543) que tem suporte IPv4:
```
postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Erro: ENOTFOUND (DNS)

**Causa**: Container nao consegue resolver nomes DNS
**Solucao**: O docker-compose.yaml ja configura DNS publicos (8.8.8.8, 1.1.1.1). Se persistir, use IP direto na DATABASE_URL.

### Erro: Extensao vector nao encontrada

**Causa**: pgvector nao habilitado
**Solucao**: Execute no SQL Editor do Supabase:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Erro de permissao no docker-entrypoint.sh

**Causa**: Arquivo sem permissao de execucao
**Solucao**: Ja corrigido no Dockerfile, mas se persistir:
```bash
chmod +x docker-entrypoint.sh
```

### Erro 502 Bad Gateway

**Causa**: Aplicacao ainda inicializando ou crashou
**Solucao**:
1. Aguarde 30-60 segundos
2. Verifique os logs
3. Aumente o timeout de health check

---

## Credenciais Padrao

Apos o primeiro deploy, faca login com:
- **Usuario**: admin
- **Senha**: admin123

**IMPORTANTE**: Altere a senha do admin imediatamente apos o primeiro acesso!
