# Deploy SimulaVoto no Portainer

Guia completo para deploy do SimulaVoto usando Portainer com banco de dados PostgreSQL local.

> **Atualizando uma instalação existente?** Consulte [DEPLOY-UPDATE-PORTAINER.md](./DEPLOY-UPDATE-PORTAINER.md)

---

## Pré-requisitos

- Portainer instalado e funcionando
- Acesso SSH ao servidor (para build local)

---

## 1. Arquitetura

O SimulaVoto utiliza dois containers:

| Container | Imagem | Descrição |
|-----------|--------|-----------|
| `simulavoto-db` | `pgvector/pgvector:pg16` | PostgreSQL 16 com pgvector (banco local) |
| `simulavoto` | Build local (Dockerfile) | Aplicação Node.js |

O banco de dados é inicializado automaticamente com o script `init-db.sql` no primeiro deploy. Os dados ficam persistidos no volume Docker `simulavoto_pgdata`.

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
POSTGRES_PASSWORD=SuaSenhaSegura2026!
SESSION_SECRET=GERE_COM_openssl_rand_base64_32
OPENAI_API_KEY=sk-sua-chave-aqui
EOF
```

Para gerar SESSION_SECRET:
```bash
openssl rand -base64 32
```

Para gerar POSTGRES_PASSWORD:
```bash
openssl rand -base64 24
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
simulavoto-db  | database system is ready to accept connections
simulavoto     | Database pool initialized successfully
simulavoto     | Server running on port 5000
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
4. **Compose path**: `docker-compose.portainer.yml`

### 3.3 Adicionar Environment Variables
Clique em **Add environment variable** para cada:

| Nome | Valor |
|------|-------|
| `POSTGRES_PASSWORD` | Senha segura para o PostgreSQL local (ex: resultado de `openssl rand -base64 24`) |
| `SESSION_SECRET` | Resultado de `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-sua-chave-aqui` |

> **Nota**: A `DATABASE_URL` é gerada automaticamente pelo docker-compose usando a `POSTGRES_PASSWORD`. Você não precisa configurá-la manualmente.

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

> **Nota**: Se o Nginx Proxy Manager estiver em outro stack/contexto Docker, use o IP do servidor ao invés do nome do container.

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
docker compose logs -f db
```

### Reiniciar aplicação
```bash
docker compose restart simulavoto
```

### Reiniciar banco
```bash
docker compose restart db
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

### Remover tudo (incluindo dados do banco)
```bash
docker compose down -v
```

> **CUIDADO**: `docker compose down -v` remove o volume com todos os dados do banco!

---

## 6. Backup e Restauração

### Backup do banco
```bash
docker exec simulavoto-db pg_dump -U simulavoto simulavoto > backup_$(date +%Y%m%d).sql
```

### Restaurar backup
```bash
docker exec -i simulavoto-db psql -U simulavoto simulavoto < backup_20260210.sql
```

### Backup do volume Docker
```bash
docker run --rm -v simulavoto_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata_backup.tar.gz -C /data .
```

---

## 7. Troubleshooting

### Container da aplicação não inicia
```bash
docker compose logs simulavoto
```

### Container do banco não inicia
```bash
docker compose logs db
```

### Verificar se o banco está acessível
```bash
docker exec simulavoto-db pg_isready -U simulavoto -d simulavoto
```

### Acessar o banco via psql
```bash
docker exec -it simulavoto-db psql -U simulavoto -d simulavoto
```

### Health check falhando
```bash
docker exec simulavoto wget -qO- http://localhost:5000/api/health
```

### Reinicializar banco (apagar tudo)
```bash
docker compose down -v
docker compose up -d --build
```

---

## 8. Credenciais Padrão

- **Usuário**: `admin`
- **Senha**: `admin123`

**IMPORTANTE**: Altere a senha após o primeiro login!

---

## 9. Acesso ao Banco de Dados

O PostgreSQL está exposto na porta **5433** do host (para evitar conflito com PostgreSQL local na porta 5432).

Para conectar de fora do Docker:
```bash
psql -h localhost -p 5433 -U simulavoto -d simulavoto
```

A senha é a definida em `POSTGRES_PASSWORD` no `.env`.

---

## 10. Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `POSTGRES_PASSWORD` | Sim | Senha do PostgreSQL local |
| `SESSION_SECRET` | Sim | Segredo para criptografia de sessões |
| `OPENAI_API_KEY` | Não* | Para recursos de IA (previsões, análise, KPIs) |
| `RESEND_API_KEY` | Não | Para envio de relatórios por email |

*Recursos de IA requerem OPENAI_API_KEY para funcionar completamente.

> **Nota**: `DATABASE_URL`, `NODE_ENV` e `PORT` são configurados automaticamente pelo docker-compose.

---

## 11. Funcionalidades Disponíveis

| Módulo | Descrição |
|--------|-----------|
| **Dashboard Eleitoral** | Mapa interativo do Brasil, métricas consolidadas, status de importações |
| **Simulações** | Cálculo de quocientes eleitorais, distribuição de cadeiras (D'Hondt) |
| **Importação TSE** | Upload de CSV até 5GB com monitoramento em tempo real |
| **Importação IBGE** | Municípios, população e indicadores com import otimizado em lote |
| **Previsões IA** | Monte Carlo, análise de tendências, narrativas GPT-4o |
| **Análise de Sentimento** | Multi-fonte (notícias, redes sociais), word cloud, alertas de crise |
| **Campanhas** | Gestão de equipe, calendário, orçamento, KPIs estratégicos |
| **Relatórios** | Geração automática CSV/PDF, agendamento, envio por email |
