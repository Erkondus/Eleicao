# Deploy SimulaVoto no Portainer

Guia completo para deploy do SimulaVoto usando Portainer.

---

## Pré-requisitos

- Portainer instalado e funcionando
- Acesso SSH ao servidor (para build local)
- Banco de dados Supabase configurado

---

## 1. Configurar Banco de Dados (Supabase)

### 1.1 Habilitar Extensões
No Supabase SQL Editor, execute:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1.2 Executar Script de Inicialização
1. Acesse: https://supabase.com/dashboard
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `scripts/init-db.sql`

### 1.3 Obter Connection String
1. Vá em **Settings** → **Database**
2. Copie a **Connection string (URI)**
3. Formato: `postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres`

---

## 2. Deploy via SSH (Recomendado)

### 2.1 Clonar Repositório
```bash
cd /opt
git clone https://github.com/Erkondus/Eleicao.git simulavoto
cd simulavoto
```

### 2.2 Criar arquivo .env
```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.xxx.supabase.co:5432/postgres
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
DOMAIN=simulavoto.seudominio.com
EOF
```

Para gerar SESSION_SECRET:
```bash
openssl rand -base64 32
```

### 2.3 Build e Deploy
```bash
docker compose up -d --build
```

### 2.4 Verificar Status
```bash
docker compose logs -f
```

Deve mostrar:
```
DoH resolved db.xxx.supabase.co to: 1.2.3.4
Database pool initialized with IPv4 resolution
Server running on port 5000
```

---

## 3. Deploy via Portainer UI

### 3.1 Criar Stack
1. Acesse Portainer
2. Vá em **Stacks** → **Add Stack**
3. Nome: `simulavoto`

### 3.2 Método: Git Repository
1. Selecione **Repository**
2. **Repository URL**: `https://github.com/Erkondus/Eleicao`
3. **Repository reference**: `refs/heads/main`
4. **Compose path**: `docker-compose.yaml`

### 3.3 Adicionar Environment Variables
Clique em **Add environment variable** para cada:

| Nome | Valor |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres` |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |
| `DOMAIN` | `simulavoto.seudominio.com` |

### 3.4 Deploy
Clique em **Deploy the stack**

---

## 4. Configurar Nginx Proxy Manager

### 4.1 Adicionar Proxy Host

1. Acesse o painel do **Nginx Proxy Manager**
2. Vá em **Hosts** → **Proxy Hosts** → **Add Proxy Host**

### 4.2 Configurar o Host

**Aba Details:**
| Campo | Valor |
|-------|-------|
| Domain Names | `simulavoto.seudominio.com` |
| Scheme | `http` |
| Forward Hostname/IP | `simulavoto` (nome do container) ou `IP_DO_SERVIDOR` |
| Forward Port | `5000` |
| Cache Assets | ✅ (opcional) |
| Block Common Exploits | ✅ |
| Websockets Support | ✅ |

### 4.3 Configurar SSL

**Aba SSL:**
| Campo | Valor |
|-------|-------|
| SSL Certificate | Request a new SSL Certificate |
| Force SSL | ✅ |
| HTTP/2 Support | ✅ |
| HSTS Enabled | ✅ (opcional) |
| Email | seu@email.com |
| I Agree... | ✅ |

Clique em **Save**.

### 4.4 Alternativa: Acesso Direto (sem proxy)
Acesse: `http://IP_DO_SERVIDOR:5000`

---

## 5. Comandos Úteis

### Ver logs
```bash
docker compose logs -f simulavoto
```

### Reiniciar
```bash
docker compose restart simulavoto
```

### Atualizar (nova versão)
```bash
git pull
docker compose up -d --build
```

### Parar
```bash
docker compose down
```

### Remover tudo (incluindo volumes)
```bash
docker compose down -v
```

---

## 6. Troubleshooting

### Container não inicia
```bash
docker compose logs simulavoto
```

### Erro de DNS (ENOTFOUND)
A aplicação usa DNS-over-HTTPS como fallback. Os logs devem mostrar:
```
System DNS failed for db.xxx.supabase.co, trying DoH...
DoH resolved db.xxx.supabase.co to: 1.2.3.4
```

Se ainda não funcionar, use IP direto na DATABASE_URL:
```bash
nslookup db.xxx.supabase.co
# Use o IP retornado na DATABASE_URL
```

### Erro de conexão SSL
Verifique se a DATABASE_URL está correta e o Supabase permite conexões externas.

### Health check falhando
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

---

## 7. Credenciais Padrão

- **Usuário**: `admin`
- **Senha**: `admin123`

⚠️ **IMPORTANTE**: Altere a senha após o primeiro login!

---

## 8. Backup

### Backup do banco (Supabase)
Use o painel do Supabase ou pg_dump:
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Restaurar
```bash
psql $DATABASE_URL < backup.sql
```
