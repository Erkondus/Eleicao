# Deploy SimulaVoto no Portainer

Guia completo para deploy do SimulaVoto usando Portainer com Docker standalone.

O sistema suporta dois modos de banco de dados:
- **Modo Local**: PostgreSQL em container Docker (`docker-compose.portainer.yml`)
- **Modo Externo**: Supabase self-hosted ou qualquer PostgreSQL remoto (`docker-compose.supabase.yml`)

> **Atualizando uma instalacao existente?** Consulte [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md)

---

## 1. Arquitetura

### Modo Local (docker-compose.portainer.yml)

| Container | Imagem | Descricao |
|-----------|--------|-----------|
| `simulavoto-db` | `pgvector/pgvector:pg16` | PostgreSQL 16 com pgvector |
| `simulavoto` | Build local (Dockerfile) | Aplicacao Node.js |

O banco e inicializado automaticamente com `init-db.sql` no primeiro deploy. Dados persistidos no volume `simulavoto_pgdata`.

### Modo Externo (docker-compose.supabase.yml)

| Container | Imagem | Descricao |
|-----------|--------|-----------|
| `simulavoto` | Build local (Dockerfile) | Aplicacao Node.js |

Apenas o container da aplicacao. O banco fica no servidor Supabase externo.

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

**Modo Externo (Supabase self-hosted em bpxgroup.com.br):**
```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:SuaSenhaSupabase@72.60.255.204:5432/postgres
DATABASE_SSL=auto
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
EOF
```

> **IMPORTANTE**: Usar o IP direto (`72.60.255.204`) porque o dominio `supabase.bpxgroup.com.br`
> passa pelo Cloudflare, que nao redireciona conexoes PostgreSQL (porta 5432).
> `DATABASE_SSL=auto` (padrao) tenta SSL primeiro e faz fallback automaticamente.
> Se seu PostgreSQL tem SSL habilitado (ex: Nginx/Supavisor com Let's Encrypt), use `DATABASE_SSL=true`.

Para gerar senhas seguras:
```bash
openssl rand -base64 24    # para POSTGRES_PASSWORD
openssl rand -base64 32    # para SESSION_SECRET
```

### 2.3 Build e Deploy

**Modo Local (com banco no Docker):**
```bash
docker compose -f docker-compose.portainer.yml up -d --build
```

**Modo Externo (Supabase):**
```bash
docker compose -f docker-compose.supabase.yml up -d --build
```

### 2.4 Verificar Status
```bash
docker compose logs -f simulavoto
```

Deve mostrar:
```
simulavoto     | Database mode: LOCAL (container/internal)
simulavoto     | Database pool initialized successfully
simulavoto     | Server running on port 5000
```

Ou para modo externo:
```
simulavoto     | Database mode: EXTERNAL (Supabase/cloud)
simulavoto     | Connecting to: 72.60.255.204:5432
simulavoto     | SSL: auto mode - app will try SSL first, fallback without
simulavoto     | SSL mode: auto (DATABASE_SSL=auto)
simulavoto     | SSL: connected successfully WITH SSL
simulavoto     | Database pool initialized successfully
simulavoto     | Server running on port 5000
```

---

## 3. Deploy via Portainer UI

### 3.1 Criar Stack
1. Acesse o Portainer
2. Va em **Stacks** > **Add Stack**
3. Nome: `simulavoto`

### 3.2 Metodo: Git Repository
1. Selecione **Repository**
2. **Repository URL**: `https://github.com/Erkondus/Eleicao`
3. **Repository reference**: `refs/heads/main`
4. **Compose path**:
   - Modo Local: `docker-compose.portainer.yml`
   - Modo Externo (Supabase): `docker-compose.supabase.yml`

### 3.3 Adicionar Environment Variables

**Modo Local (docker-compose.portainer.yml):**

| Nome | Valor |
|------|-------|
| `POSTGRES_PASSWORD` | Resultado de `openssl rand -base64 24` |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

> A `DATABASE_URL` e construida automaticamente pelo entrypoint usando `POSTGRES_PASSWORD`.

**Modo Externo (docker-compose.supabase.yml):**

| Nome | Valor |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres:SuaSenha@72.60.255.204:5432/postgres` |
| `DATABASE_SSL` | `auto` (tenta SSL primeiro, fallback sem SSL) |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

> **IMPORTANTE**: Use o IP direto do servidor (`72.60.255.204`) em vez do dominio (`supabase.bpxgroup.com.br`), pois o dominio passa pelo Cloudflare que nao redireciona conexoes PostgreSQL.

### 3.4 Deploy
Clique em **Deploy the stack**

---

## 4. Supabase Self-Hosted (bpxgroup.com.br)

### Configuracao de acesso

| Servico | URL |
|---------|-----|
| Dashboard Supabase | `https://supabase.bpxgroup.com.br` |
| API Supabase | `https://supabaseapi.bpxgroup.com.br` |
| PostgreSQL direto | `72.60.255.204:5432` (IP direto, sem Cloudflare) |

> **ATENCAO**: O dominio `supabase.bpxgroup.com.br` passa pelo Cloudflare (proxy ativado).
> O Cloudflare so redireciona HTTP/HTTPS (portas 80/443), NAO redireciona PostgreSQL (porta 5432).
> Por isso, a DATABASE_URL deve usar o **IP direto** do servidor: `72.60.255.204`

### Formato da DATABASE_URL

**Conexao direta via IP (recomendado):**
```
postgresql://postgres:[SENHA]@72.60.255.204:5432/postgres
```

**Via Connection Pooler/PgBouncer (porta 6543):**
```
postgresql://postgres:[SENHA]@72.60.255.204:6543/postgres
```

> **Dica**: Se SimulaVoto e Supabase estiverem no mesmo servidor, voce pode usar o IP interno do Docker
> (ex: `172.x.x.x`) na DATABASE_URL. Nesse caso o sistema detecta como modo LOCAL (sem SSL).

### Controle de SSL

| Valor de `DATABASE_SSL` | Comportamento |
|--------------------------|---------------|
| `auto` (padrao) | Tenta com SSL primeiro; se falhar, tenta sem SSL automaticamente |
| `true` | SSL sempre habilitado (forcar SSL) |
| `false` | SSL sempre desabilitado |

**Supabase com Nginx + Let's Encrypt:**
- O certificado Let's Encrypt protege as portas HTTP/HTTPS (80/443) do dashboard e API
- A conexao PostgreSQL (porta 5432) pode ou nao ter SSL proprio
- Use `DATABASE_SSL=auto` (padrao) - o sistema tenta SSL primeiro e faz fallback automaticamente
- Se voce sabe que o PostgreSQL tem SSL habilitado (ex: via Supavisor), use `DATABASE_SSL=true`

### Preparar banco no Supabase

Antes do primeiro deploy, execute no SQL Editor do Supabase (`https://supabase.bpxgroup.com.br`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

A aplicacao cria as tabelas automaticamente via Drizzle ORM no primeiro inicio.

---

## 5. Como Funciona a Deteccao de Modo

O sistema detecta automaticamente o modo com base no hostname da `DATABASE_URL`:

| Hostname | Modo | SSL | DNS IPv4 |
|----------|------|-----|----------|
| `db`, `localhost`, `127.0.0.1` | LOCAL | Desabilitado | Nao necessario |
| `172.x`, `192.168.x`, `10.x` | LOCAL | Desabilitado | Nao necessario |
| Hostname sem ponto (ex: `postgres-server`) | LOCAL | Desabilitado | Nao necessario |
| Qualquer dominio (ex: `supabase.bpxgroup.com.br`) | EXTERNO | Habilitado | Forcado IPv4 |

Nao precisa configurar nada alem da `DATABASE_URL` correta.

---

## 6. Qual arquivo compose usar?

| Cenario | Arquivo | Variaveis obrigatorias |
|---------|---------|----------------------|
| Banco no Docker (local) | `docker-compose.portainer.yml` | `POSTGRES_PASSWORD`, `SESSION_SECRET` |
| Supabase bpxgroup.com.br | `docker-compose.supabase.yml` | `DATABASE_URL`, `SESSION_SECRET` |
| Supabase Cloud (supabase.com) | `docker-compose.supabase.yml` | `DATABASE_URL`, `SESSION_SECRET` |
| Outro PostgreSQL externo | `docker-compose.supabase.yml` | `DATABASE_URL`, `SESSION_SECRET` |
| Dev local (sem Docker) | `docker-compose.yaml` | `POSTGRES_PASSWORD`, `SESSION_SECRET` |

---

## 7. Configurar Nginx Proxy Manager

### 7.1 Adicionar Proxy Host

1. Acesse o painel do **Nginx Proxy Manager**
2. Va em **Hosts** > **Proxy Hosts** > **Add Proxy Host**

### 7.2 Configurar o Host

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

### 7.3 Configurar SSL

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

### 7.4 Alternativa: Acesso Direto (sem proxy)
Acesse: `http://IP_DO_SERVIDOR:5000`

---

## 8. Comandos Uteis

### Ver logs
```bash
docker compose -f docker-compose.supabase.yml logs -f simulavoto    # modo externo
docker compose -f docker-compose.portainer.yml logs -f simulavoto   # modo local
docker compose -f docker-compose.portainer.yml logs -f db           # banco local
```

### Reiniciar aplicacao
```bash
docker compose -f docker-compose.supabase.yml restart simulavoto
```

### Atualizar (nova versao)
```bash
git pull
docker compose -f docker-compose.supabase.yml up -d --build     # modo externo
docker compose -f docker-compose.portainer.yml up -d --build     # modo local
```

### Parar
```bash
docker compose -f docker-compose.supabase.yml down    # modo externo
docker compose -f docker-compose.portainer.yml down    # modo local
```

### Remover tudo (incluindo dados do banco local)
```bash
docker compose -f docker-compose.portainer.yml down -v
```

> **CUIDADO**: `-v` remove o volume com todos os dados do banco local!

---

## 9. Backup e Restauracao

### Backup do banco local
```bash
docker exec simulavoto-db pg_dump -U simulavoto simulavoto > backup_$(date +%Y%m%d).sql
```

### Backup do banco Supabase
```bash
pg_dump "postgresql://postgres:SENHA@supabase.bpxgroup.com.br:5432/postgres" > backup_supabase_$(date +%Y%m%d).sql
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

## 10. Troubleshooting

### "unable to deploy stack" no Portainer
**Causa mais comum**: Variaveis de ambiente nao definidas ou arquivo compose errado.
- Verifique se todas as variaveis obrigatorias estao definidas (secao 3.3)
- Verifique se o **Compose path** aponta para o arquivo correto (secao 3.2)
- Modo local: use `docker-compose.portainer.yml`
- Modo externo: use `docker-compose.supabase.yml`

### Container da aplicacao nao inicia
```bash
docker compose -f docker-compose.supabase.yml logs simulavoto
```

### Erro de conexao com Supabase
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

Verifique:
1. A `DATABASE_URL` esta correta (usuario, senha, host, porta, banco)
2. O Supabase esta acessivel na porta indicada
3. As extensoes `vector` e `pg_trgm` estao criadas no banco

### Erro ENETUNREACH com Supabase
**Causa**: DNS retorna IPv6 e o container nao tem conectividade IPv6.
**Solucao**: O `docker-compose.supabase.yml` ja configura DNS publico (8.8.8.8 e 1.1.1.1) e o app forca IPv4 via NODE_OPTIONS.

### Health check falhando
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

### Acessar o banco via psql (modo local)
```bash
docker exec -it simulavoto-db psql -U simulavoto -d simulavoto
```

---

## 11. Credenciais Padrao

- **Usuario**: `admin`
- **Senha**: `admin123`

**IMPORTANTE**: Altere a senha apos o primeiro login!

---

## 12. Acesso ao Banco de Dados (modo local)

O PostgreSQL esta exposto na porta **5433** do host (para evitar conflito com PostgreSQL local na porta 5432).

Para conectar de fora do Docker:
```bash
psql -h localhost -p 5433 -U simulavoto -d simulavoto
```

---

## 13. Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `DATABASE_URL` | Modo externo | URL completa do PostgreSQL. Usar IP direto: `postgresql://postgres:SENHA@72.60.255.204:5432/postgres` |
| `DATABASE_SSL` | Nao | Controle de SSL: `auto` (padrao, tenta SSL com fallback), `true` (forcar), `false` (desabilitar) |
| `POSTGRES_PASSWORD` | Modo local | Senha do PostgreSQL local. Ignorada se DATABASE_URL definida |
| `SESSION_SECRET` | Sim | Segredo para criptografia de sessoes |
| `OPENAI_API_KEY` | Nao* | Para recursos de IA (previsoes, analise, KPIs) |
| `RESEND_API_KEY` | Nao | Para envio de relatorios por email |

*Recursos de IA requerem OPENAI_API_KEY para funcionar completamente.

---

## 14. Funcionalidades Disponiveis

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
