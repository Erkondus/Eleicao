# SimulaVoto - Guia de Deploy

Este guia explica como fazer deploy do SimulaVoto no Coolify com Supabase como banco de dados.

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Configuração do Supabase](#configuração-do-supabase)
3. [Configuração do Coolify](#configuração-do-coolify)
4. [Variáveis de Ambiente](#variáveis-de-ambiente)
5. [Deploy Local com Docker](#deploy-local-com-docker)
6. [Comandos Úteis](#comandos-úteis)
7. [Solução de Problemas](#solução-de-problemas)

---

## Pré-requisitos

- Conta no [Supabase](https://supabase.com) (gratuito para começar)
- Servidor com [Coolify](https://coolify.io) instalado
- Chave de API do OpenAI (para recursos de IA)
- Git repository com o código fonte

---

## Configuração do Supabase

### 1. Criar Projeto

1. Acesse [app.supabase.com](https://app.supabase.com)
2. Clique em "New Project"
3. Configure:
   - **Nome**: SimulaVoto (ou nome de sua preferência)
   - **Senha do Banco**: Gere uma senha forte
   - **Região**: Escolha a mais próxima (ex: South America - São Paulo)
4. Clique em "Create new project"

### 2. Habilitar Extensão pgvector

1. Vá em **SQL Editor** no painel do Supabase
2. Execute:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 3. Executar Script de Criação de Tabelas

1. No **SQL Editor**, copie e execute o conteúdo do arquivo:
   ```
   scripts/init-db.sql
   ```

### 4. Obter Connection String

1. Vá em **Settings** → **Database**
2. Copie a **Connection String** (URI)
3. Substitua `[YOUR-PASSWORD]` pela senha do banco
4. A URL deve parecer com:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

---

## Configuração do Coolify

### 1. Adicionar Novo Projeto

1. Acesse seu dashboard do Coolify
2. Clique em **New Project**
3. Nomeie como "SimulaVoto"

### 2. Configurar Aplicação

1. Clique em **Add New Resource** → **Application**
2. Selecione **Docker (Build Pack)**
3. Conecte seu repositório Git
4. Configure o branch (main/master)

### 3. Configurações de Build

```yaml
Build Command: npm run build
Start Command: ./docker-entrypoint.sh
Port: 5000
Health Check Path: /api/health
```

### 4. Configurar Variáveis de Ambiente

Adicione as seguintes variáveis em **Environment Variables**:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql://...` |
| `SESSION_SECRET` | Segredo para sessões (32+ caracteres) | `gerar-string-aleatoria-longa` |
| `OPENAI_API_KEY` | Chave API do OpenAI | `sk-...` |
| `NODE_ENV` | Ambiente | `production` |
| `PORT` | Porta da aplicação | `5000` |

### 5. Recursos Recomendados

- **RAM**: Mínimo 512MB, recomendado 1GB
- **CPU**: 0.5 vCPU mínimo
- **Storage**: 1GB para logs e cache

### 6. Deploy

1. Clique em **Deploy**
2. Aguarde o build completar
3. Verifique os logs para erros
4. Acesse a URL fornecida

---

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string do PostgreSQL/Supabase |
| `SESSION_SECRET` | String secreta para criptografia de sessões |

### Opcionais

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `OPENAI_API_KEY` | Para recursos de IA | - |
| `NODE_ENV` | Ambiente de execução | `production` |
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

### Usando Docker Compose (Desenvolvimento)

1. Clone o repositório
2. Crie um arquivo `.env`:
   ```env
   DATABASE_URL=postgresql://simulavoto:simulavoto123@localhost:5432/simulavoto
   SESSION_SECRET=sua-chave-secreta-aqui-32-caracteres
   OPENAI_API_KEY=sk-sua-chave-openai
   ```

3. Inicie os containers:
   ```bash
   docker-compose up -d
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
     -e DATABASE_URL="sua-url-do-banco" \
     -e SESSION_SECRET="sua-chave-secreta" \
     -e OPENAI_API_KEY="sk-sua-chave" \
     simulavoto:latest
   ```

---

## Comandos Úteis

### Verificar Saúde da Aplicação

```bash
curl http://localhost:5000/api/health
```

### Visualizar Logs

```bash
# Docker
docker logs -f simulavoto

# Docker Compose
docker-compose logs -f app
```

### Reiniciar Aplicação

```bash
# Docker Compose
docker-compose restart app

# Docker
docker restart simulavoto
```

### Executar Migrações Manualmente

```bash
docker exec -it simulavoto npm run db:push
```

### Acessar Shell do Container

```bash
docker exec -it simulavoto sh
```

---

## Solução de Problemas

### Erro: DATABASE_URL não definida

**Causa**: Variável de ambiente não configurada
**Solução**: Verifique se `DATABASE_URL` está definida no Coolify ou `.env`

### Erro: Conexão recusada ao banco

**Causas possíveis**:
1. Supabase ainda inicializando
2. Senha incorreta
3. IP não liberado

**Soluções**:
1. Aguarde alguns minutos após criar o projeto
2. Verifique a senha na connection string
3. No Supabase, vá em Settings → Database e verifique "Network restrictions"

### Erro: Extensão vector não encontrada

**Causa**: pgvector não habilitado
**Solução**: Execute no SQL Editor do Supabase:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Erro de permissão no docker-entrypoint.sh

**Causa**: Arquivo sem permissão de execução
**Solução**: Já corrigido no Dockerfile, mas se persistir:
```bash
chmod +x docker-entrypoint.sh
```

### Aplicação não responde

1. Verifique os logs para erros
2. Confirme que a porta 5000 está exposta
3. Verifique o health check
4. Reinicie o container

### Erro 502 Bad Gateway

**Causa**: Aplicação ainda inicializando ou crashou
**Solução**:
1. Aguarde 30-60 segundos
2. Verifique os logs
3. Aumente o timeout de health check

### Erro: ENETUNREACH ao conectar ao banco

**Causa**: O servidor está tentando conectar via IPv6 mas a rede não suporta
**Sintoma**: Logs mostram erro `ENETUNREACH` com endereço IPv6 (ex: `2600:1f1e:...`)

**Solução 1 - Automática (já implementada)**:
O docker-entrypoint.sh já força IPv4 com:
```sh
export NODE_OPTIONS="--dns-result-order=ipv4first"
```

**Solução 2 - Connection String IPv4**:
Use a connection string com host IPv4 direto do Supabase:
1. No Supabase, vá em Settings → Database
2. Use "Direct connection" em vez de "Session pooler"
3. Ou adicione `?options=-c%20prefer_ipv4=true` à URL

**Solução 3 - Adicionar variável no Coolify**:
Adicione esta variável de ambiente:
```
NODE_OPTIONS=--dns-result-order=ipv4first
```

---

## Credenciais Padrão

Após o primeiro deploy, faça login com:
- **Usuário**: admin
- **Senha**: admin123

⚠️ **IMPORTANTE**: Altere a senha do admin imediatamente após o primeiro acesso!

---

## Suporte

Para problemas específicos:
1. Verifique os logs da aplicação
2. Consulte a documentação do Coolify
3. Verifique status do Supabase

---

## Próximos Passos

1. ✅ Deploy inicial
2. ⬜ Configurar domínio personalizado
3. ⬜ Configurar SSL/HTTPS
4. ⬜ Configurar backup automático do banco
5. ⬜ Monitoramento e alertas
6. ⬜ Alterar senha do usuário admin
