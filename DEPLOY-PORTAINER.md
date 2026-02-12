# Deploy SimulaVoto no Portainer

Guia completo para deploy do SimulaVoto usando Portainer com Docker standalone.

O sistema suporta dois modos de banco de dados:
- **Modo Local**: PostgreSQL em container Docker (recomendado para simplicidade)
- **Modo Externo**: Supabase ou qualquer PostgreSQL remoto (recomendado se ja possui infraestrutura)

> **Atualizando uma instalacao existente?** Consulte [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md)

---

## 1. Arquitetura

### Modo Local (banco no Docker)

| Container | Imagem | Descricao |
|-----------|--------|-----------|
| `simulavoto-db` | `pgvector/pgvector:pg16` | PostgreSQL 16 com pgvector (banco local) |
| `simulavoto` | Build local (Dockerfile) | Aplicacao Node.js |

O banco e inicializado automaticamente com `init-db.sql` no primeiro deploy. Dados persistidos no volume `simulavoto_pgdata`.

### Modo Externo (Supabase ou outro)

| Container | Imagem | Descricao |
|-----------|--------|-----------|
| `simulavoto` | Build local (Dockerfile) | Aplicacao Node.js |

Apenas o container da aplicacao. O banco fica em servidor externo (Supabase, RDS, etc).

---

## 2. Deploy via SSH

### 2.1 Clonar Repositorio
```bash
cd /opt
git clone https://github.com/Erkondus/Eleicao.git simulavoto
cd simulavoto
```

### 2.2 Criar arquivo .env

**Modo Local (banco no Docker):**
```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=SuaSenhaSegura2026!
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
EOF
```

**Modo Externo (Supabase):**
```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
EOF
```

> **IMPORTANTE (Supabase):** Use a URL do **Connection Pooler** (porta 6543) para compatibilidade com Docker.

Para gerar senhas seguras:
```bash
openssl rand -base64 24    # para POSTGRES_PASSWORD
openssl rand -base64 32    # para SESSION_SECRET
```

### 2.3 Build e Deploy

**Modo Local (com banco no Docker):**
```bash
docker compose --profile local-db up -d --build
```

**Modo Externo (Supabase - apenas aplicacao):**
```bash
docker compose up -d --build simulavoto
```

### 2.4 Verificar Status
```bash
docker compose logs -f
```

Deve mostrar:
```
simulavoto     | Database mode: LOCAL (container/internal)    # ou EXTERNAL (Supabase/cloud)
simulavoto     | Database pool initialized successfully
simulavoto     | Server running on port 5000
```

---

## 3. Deploy via Portainer UI

### 3.1 Criar Stack
1. Acesse Portainer
2. Va em **Stacks** > **Add Stack**
3. Nome: `simulavoto`

### 3.2 Metodo: Git Repository
1. Selecione **Repository**
2. **Repository URL**: `https://github.com/Erkondus/Eleicao`
3. **Repository reference**: `refs/heads/main`
4. **Compose path**: `docker-compose.portainer.yml`

### 3.3 Adicionar Environment Variables

**Modo Local:**

| Nome | Valor |
|------|-------|
| `POSTGRES_PASSWORD` | Resultado de `openssl rand -base64 24` |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

> A `DATABASE_URL` e gerada automaticamente usando a `POSTGRES_PASSWORD`.

**Modo Externo (Supabase):**

| Nome | Valor |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[senha]@aws-0-[region].pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

> Quando `DATABASE_URL` e definida, o container do banco local nao e necessario.

### 3.4 Deploy
Clique em **Deploy the stack**

---

## 4. Como Funciona a Deteccao de Modo

O sistema detecta automaticamente o modo com base no `DATABASE_URL`:

| Hostname | Modo | SSL | DNS IPv4 |
|----------|------|-----|----------|
| `db`, `localhost`, `127.0.0.1` | LOCAL | Desabilitado | Nao necessario |
| `172.x`, `192.168.x`, `10.x` | LOCAL | Desabilitado | Nao necessario |
| Hostname sem ponto (ex: `postgres-server`) | LOCAL | Desabilitado | Nao necessario |
| Qualquer outro (ex: `*.supabase.com`) | EXTERNO | Habilitado | Forcado IPv4 |

Nao precisa configurar nada - basta fornecer a `DATABASE_URL` correta.

---

## 5. Configurar Nginx Proxy Manager

### 5.1 Adicionar Proxy Host

1. Acesse o painel do **Nginx Proxy Manager**
2. Va em **Hosts** > **Proxy Hosts** > **Add Proxy Host**

### 5.2 Configurar o Host

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

> Se o Nginx Proxy Manager estiver em outro stack/contexto Docker, use o IP do servidor ao inves do nome do container.

### 5.3 Configurar SSL

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

### 5.4 Alternativa: Acesso Direto (sem proxy)
Acesse: `http://IP_DO_SERVIDOR:5000`

---

## 6. Comandos Uteis

### Ver logs
```bash
docker compose logs -f simulavoto
docker compose logs -f db          # apenas modo local
```

### Reiniciar aplicacao
```bash
docker compose restart simulavoto
```

### Atualizar (nova versao)
```bash
git pull
docker compose --profile local-db up -d --build   # modo local
docker compose up -d --build simulavoto            # modo externo
```

### Parar
```bash
docker compose --profile local-db down    # modo local
docker compose down                       # modo externo
```

### Remover tudo (incluindo dados do banco local)
```bash
docker compose --profile local-db down -v
```

> **CUIDADO**: `docker compose down -v` remove o volume com todos os dados do banco local!

---

## 7. Backup e Restauracao

### Backup do banco local
```bash
docker exec simulavoto-db pg_dump -U simulavoto simulavoto > backup_$(date +%Y%m%d).sql
```

### Backup do banco Supabase
```bash
pg_dump "$DATABASE_URL" > backup_supabase_$(date +%Y%m%d).sql
```

### Restaurar backup (banco local)
```bash
docker exec -i simulavoto-db psql -U simulavoto simulavoto < backup_20260210.sql
```

### Backup do volume Docker
```bash
docker run --rm -v simulavoto_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata_backup.tar.gz -C /data .
```

---

## 8. Troubleshooting

### Container da aplicacao nao inicia
```bash
docker compose logs simulavoto
```

### Container do banco nao inicia (modo local)
```bash
docker compose logs db
```

### Verificar se o banco esta acessivel (modo local)
```bash
docker exec simulavoto-db pg_isready -U simulavoto -d simulavoto
```

### Erro ENETUNREACH com Supabase
**Causa**: DNS retorna IPv6 e o container nao tem conectividade IPv6
**Solucao**: O sistema ja forca IPv4 automaticamente. Se persistir, adicione DNS publico:
```bash
docker compose up -d --build simulavoto
# O docker-compose ja configura DNS 8.8.8.8 e 1.1.1.1
```

### Acessar o banco via psql (modo local)
```bash
docker exec -it simulavoto-db psql -U simulavoto -d simulavoto
```

### Health check falhando
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

### Reinicializar banco local (apagar tudo)
```bash
docker compose --profile local-db down -v
docker compose --profile local-db up -d --build
```

---

## 9. Credenciais Padrao

- **Usuario**: `admin`
- **Senha**: `admin123`

**IMPORTANTE**: Altere a senha apos o primeiro login!

---

## 10. Acesso ao Banco de Dados (modo local)

O PostgreSQL esta exposto na porta **5433** do host (para evitar conflito com PostgreSQL local na porta 5432).

Para conectar de fora do Docker:
```bash
psql -h localhost -p 5433 -U simulavoto -d simulavoto
```

A senha e a definida em `POSTGRES_PASSWORD` no `.env`.

---

## 11. Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `DATABASE_URL` | Nao* | URL completa do PostgreSQL externo (Supabase). Se nao definida, usa banco local |
| `POSTGRES_PASSWORD` | Modo local | Senha do PostgreSQL local (ignorada se DATABASE_URL definida) |
| `SESSION_SECRET` | Sim | Segredo para criptografia de sessoes |
| `OPENAI_API_KEY` | Nao** | Para recursos de IA (previsoes, analise, KPIs) |
| `RESEND_API_KEY` | Nao | Para envio de relatorios por email |

*Se `DATABASE_URL` nao for definida, o sistema gera automaticamente usando `POSTGRES_PASSWORD` e conecta ao container `db`.

**Recursos de IA requerem OPENAI_API_KEY para funcionar completamente.

> `NODE_ENV` e `PORT` sao configurados automaticamente pelo docker-compose.

---

## 12. Funcionalidades Disponiveis

| Modulo | Descricao |
|--------|-----------|
| **Dashboard Eleitoral** | Mapa interativo do Brasil, metricas consolidadas, status de importacoes |
| **Simulacoes** | Calculo de quocientes eleitorais, distribuicao de cadeiras (D'Hondt) |
| **Importacao TSE** | Upload de CSV ate 5GB com monitoramento em tempo real |
| **Importacao IBGE** | Municipios, populacao e indicadores com import otimizado em lote |
| **Previsoes IA** | Monte Carlo, analise de tendencias, narrativas GPT-4o |
| **Analise de Sentimento** | Multi-fonte (noticias, redes sociais), word cloud, alertas de crise |
| **Campanhas** | Gestao de equipe, calendario, orcamento, KPIs estrategicos |
| **Relatorios** | Geracao automatica CSV/PDF, agendamento, envio por email |
