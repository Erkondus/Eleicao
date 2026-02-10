# Deploy SimulaVoto no Portainer

Guia completo para deploy do SimulaVoto usando Portainer.

> **Atualizando uma instalação existente?** Consulte [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md)

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

Para **instalações limpas**, execute APENAS o `init-db.sql`:

1. Acesse: https://supabase.com/dashboard
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `scripts/init-db.sql` (contém todas as 68 tabelas)
4. Pronto! **Não** execute o migration.

> **Nota**: O `init-db.sql` já contém todas as tabelas necessárias. O `migration-2026-01.sql` é APENAS para atualizar bancos de versões anteriores.

### 1.3 Obter Connection String (Connection Pooler)

**IMPORTANTE**: Use a URL do **Connection Pooler** (porta 6543), não a conexão direta (porta 5432). O Connection Pooler tem suporte IPv4, evitando problemas de conectividade.

1. No Supabase, vá em **Settings** → **Database**
2. Procure **Connection Pooler** (ou "Connection String - Pooler")
3. Copie a URL com porta **6543**
4. Formato:
   ```
   postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

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
DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
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
Database pool initialized successfully
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
| `DATABASE_URL` | `postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

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
| Cache Assets | Opcional |
| Block Common Exploits | Sim |
| Websockets Support | Sim |

### 4.3 Configurar SSL

**Aba SSL:**
| Campo | Valor |
|-------|-------|
| SSL Certificate | Request a new SSL Certificate |
| Force SSL | Sim |
| HTTP/2 Support | Sim |
| HSTS Enabled | Opcional |
| Email | seu@email.com |
| I Agree... | Sim |

Clique em **Save**.

### 4.4 Alternativa: Acesso Direto (sem proxy)
Acesse: `http://IP_DO_SERVIDOR:5000`

---

## 5. Comandos Uteis

### Ver logs
```bash
docker compose logs -f simulavoto
```

### Reiniciar
```bash
docker compose restart simulavoto
```

### Atualizar (nova versao)
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

### Container nao inicia
```bash
docker compose logs simulavoto
```

### Erro: ENETUNREACH (IPv6)

**Causa**: O DNS retorna apenas IPv6 e o container nao tem conectividade IPv6.

**Solucao**: Use a URL do **Connection Pooler** (porta 6543) que tem suporte IPv4:
```
postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
```

O docker-compose.yaml ja inclui DNS Google (8.8.8.8) e Cloudflare (1.1.1.1) como fallback.

### Erro: ENOTFOUND (DNS)

**Causa**: O container nao consegue resolver nomes DNS.

**Solucao 1**: O docker-compose.yaml ja configura DNS publicos.

**Solucao 2**: Use IP direto:
```bash
nslookup aws-0-us-east-1.pooler.supabase.com
# Use o IP retornado na DATABASE_URL
```

### Erro: SSL/TLS
Verifique se a DATABASE_URL esta correta e o Supabase permite conexoes externas.

### Health check falhando
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

### Erro: network not found
Se estiver usando Portainer Stack e ver erro sobre `network not found`:
- Certifique-se de usar a versao mais recente do `docker-compose.yaml` (sem redes externas)
- Execute: `docker compose down && docker compose up -d`

---

## 7. Credenciais Padrao

- **Usuario**: `admin`
- **Senha**: `admin123`

**IMPORTANTE**: Altere a senha apos o primeiro login!

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

---

## 9. Funcionalidades Disponiveis

### Modulos Principais

| Modulo | Descricao |
|--------|-----------|
| **Dashboard Eleitoral** | Mapa interativo do Brasil, metricas consolidadas, status de importacoes |
| **Simulacoes** | Calculo de quocientes eleitorais, distribuicao de cadeiras (D'Hondt) |
| **Importacao TSE** | Upload de CSV ate 5GB com monitoramento em tempo real |
| **Previsoes IA** | Monte Carlo, analise de tendencias, narrativas GPT-4o |
| **Analise de Sentimento** | Multi-fonte (noticias, redes sociais), word cloud, alertas de crise |
| **Campanhas** | Gestao de equipe, calendario, orcamento, KPIs estrategicos |
| **Relatorios** | Geracao automatica CSV/PDF, agendamento, envio por email |

### Variaveis de Ambiente Completas

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL/Supabase (usar Connection Pooler porta 6543) |
| `SESSION_SECRET` | Sim | Segredo para criptografia de sessoes |
| `OPENAI_API_KEY` | Nao* | Para recursos de IA (previsoes, analise, KPIs) |
| `RESEND_API_KEY` | Nao | Para envio de relatorios por email |
| `NODE_ENV` | Nao | Ambiente de execucao (padrao: production) |
| `PORT` | Nao | Porta do servidor (padrao: 5000) |

*Recursos de IA requerem OPENAI_API_KEY para funcionar completamente.
