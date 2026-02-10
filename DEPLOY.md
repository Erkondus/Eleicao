# SimulaVoto - Guia de Deploy

Este guia explica como fazer deploy do SimulaVoto com banco de dados PostgreSQL local (container Docker).

## Opcoes de Deploy

| Plataforma | Guia |
|------------|------|
| **Portainer** (Recomendado) | [DEPLOY-PORTAINER.md](./DEPLOY-PORTAINER.md) |
| **Atualizacao Portainer** | [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md) |
| **Coolify** | Este documento |
| **Docker direto** | Secao [Deploy Local com Docker](#deploy-local-com-docker) |

## Indice

1. [Pre-requisitos](#pre-requisitos)
2. [Configuracao do Banco de Dados](#configuracao-do-banco-de-dados)
3. [Configuracao do Coolify](#configuracao-do-coolify)
4. [Variaveis de Ambiente](#variaveis-de-ambiente)
5. [Deploy Local com Docker](#deploy-local-com-docker)
6. [Comandos Uteis](#comandos-uteis)
7. [Solucao de Problemas](#solucao-de-problemas)

---

## Pre-requisitos

- Servidor com [Coolify](https://coolify.io) ou [Portainer](https://www.portainer.io/)
- Chave de API do OpenAI (para recursos de IA)
- Git repository com o codigo fonte

---

## Configuracao do Banco de Dados

O banco de dados PostgreSQL e executado como um container Docker local, usando a imagem `pgvector/pgvector:pg16` que ja inclui suporte a extensao `vector` para busca semantica.

### Inicializacao Automatica

O banco e inicializado automaticamente no primeiro deploy:
- O script `scripts/init-db.sql` e montado como volume e executado automaticamente pelo PostgreSQL
- As extensoes `pgcrypto`, `uuid-ossp` e `vector` sao criadas automaticamente
- Todas as 68 tabelas sao criadas no primeiro start

### Dados Persistentes

Os dados ficam armazenados no volume Docker `simulavoto_pgdata` e sobrevivem a reinicializacoes e atualizacoes.

> **CUIDADO**: Apenas `docker compose down -v` remove os dados do banco!

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
| `POSTGRES_PASSWORD` | Senha do PostgreSQL local | `SuaSenhaSegura2026!` |
| `SESSION_SECRET` | Segredo para sessoes (32+ caracteres) | `gerar-string-aleatoria-longa` |
| `OPENAI_API_KEY` | Chave API do OpenAI | `sk-...` |

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
| `POSTGRES_PASSWORD` | Senha do PostgreSQL local |
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
   POSTGRES_PASSWORD=SuaSenhaSegura2026!
   SESSION_SECRET=sua-chave-secreta-aqui-32-caracteres
   OPENAI_API_KEY=sk-sua-chave-openai
   ```

3. Inicie os containers:
   ```bash
   docker compose up -d --build
   ```

4. Acesse: http://localhost:5000

> O banco PostgreSQL e criado automaticamente como container Docker com volume persistente.

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
**Solucao**: A `DATABASE_URL` e gerada automaticamente pelo docker-compose. Verifique se `POSTGRES_PASSWORD` esta definida no `.env`.

### Erro: Banco nao conecta

**Causa**: Container do banco ainda inicializando
**Solucao**: Verifique se o container do banco esta saudavel:
```bash
docker exec simulavoto-db pg_isready -U simulavoto -d simulavoto
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
