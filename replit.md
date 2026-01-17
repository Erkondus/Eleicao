# SimulaVoto - Sistema de Simulação Eleitoral Brasileiro

## Visão Geral
SimulaVoto é um sistema web completo para simular resultados eleitorais proporcionais brasileiros seguindo o sistema do TSE (Tribunal Superior Eleitoral). Inclui cálculo de quociente eleitoral, distribuição de cadeiras pelo método D'Hondt, previsões com IA, controle de acesso baseado em funções e trilha de auditoria completa.

## Mudanças Recentes
- **2026-01-17**: Página AI Insights com análises preditivas avançadas (comparecimento, candidatos, partidos)
- **2026-01-17**: Previsão de comparecimento eleitoral baseada em padrões históricos
- **2026-01-17**: Probabilidade de sucesso de candidatos com fatores de influência
- **2026-01-17**: Previsão de desempenho partidário com análise de tendências
- **2026-01-17**: Insights estratégicos com descobertas, riscos e recomendações
- **2026-01-17**: Análise de sentimento (extensível para notícias e mídias sociais)
- **2026-01-17**: Cache de previsões de IA para otimização de custos
- **2026-01-17**: Painel interativo com drill-down por região, partido e cargo
- **2026-01-17**: Busca Semântica com pgvector para consultas em linguagem natural sobre dados eleitorais
- **2026-01-17**: Embeddings automáticos gerados após importação TSE via OpenAI text-embedding-3-small
- **2026-01-17**: Interface de busca semântica com filtros, exemplos de perguntas, histórico e citações
- **2026-01-17**: Dashboard Eleitoral com mapa do Brasil interativo, métricas consolidadas e status de importações
- **2026-01-17**: Sincronização automática de partidos durante importação TSE (cria partidos que não existem)
- **2026-01-16**: Progresso detalhado de importação (download %, tempo decorrido, linhas processadas)
- **2026-01-16**: Indicador global de importações ativas na sidebar
- **2026-01-16**: Atualização de progresso em tempo real durante download e processamento
- **2026-01-16**: Priorização de arquivos _BRASIL.csv em ZIPs com múltiplos CSVs
- **2026-01-16**: Filtro de cargo na importação (Deputado, Senador, Vereador, etc.)
- **2026-01-16**: Prevenção de importação duplicada com feedback detalhado ao usuário
- **2026-01-15**: Filtros avançados: cargo, partido específico, faixa de votos (min/max)
- **2026-01-15**: Sistema de relatórios salvos para acesso rápido
- **2026-01-15**: Modo de comparação entre eleições/estados com visualizações
- **2026-01-15**: Tooltips interativos detalhados nos gráficos
- **2026-01-15**: Assistente de IA para perguntas em linguagem natural sobre dados eleitorais
- **2026-01-15**: Análise de tendências históricas com previsões de IA
- **2026-01-15**: Detecção de anomalias estatísticas nos dados de votação
- **2026-01-15**: Seção de Análise de Dados com relatórios personalizados e visualizações
- **2026-01-15**: Filtros por ano, estado e tipo de eleição para análises
- **2026-01-15**: Gráficos (barras, pizza, área) para distribuição de votos
- **2026-01-15**: Exportação de relatórios em CSV e PDF
- **2026-01-15**: Importação via URL direta do TSE (cdn.tse.jus.br)
- **2026-01-14**: Sistema de importação de dados CSV do TSE (até 5GB) com streaming e progresso
- **2026-01-14**: Tabelas para armazenar todos os 50 campos do layout de candidatos do TSE
- **2026-01-14**: Suporte a Federações (2022+) e Coligações (pré-2022) - afetam distribuição de vagas
- **2026-01-14**: Cálculo eleitoral agora agrega votos por aliança antes de distribuir vagas
- **2026-01-14**: Interface para gerenciar federações/coligações por cenário
- **2026-01-14**: Implementação completa do backend com cálculo eleitoral server-side
- **2026-01-14**: Sistema de autenticação com passport-local e bcrypt
- **2026-01-14**: RBAC implementado (admin/analyst/viewer)
- **2026-01-14**: Trilha de auditoria completa com logging de todas as operações

## Arquitetura do Projeto

### Stack Tecnológica
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Banco de Dados**: PostgreSQL com Drizzle ORM
- **Autenticação**: passport-local + express-session
- **IA**: OpenAI GPT-4o via Replit AI Integrations
- **Busca Semântica**: pgvector + OpenAI text-embedding-3-small (1536 dims)

### Estrutura de Diretórios
```
├── client/src/
│   ├── components/     # Componentes reutilizáveis (sidebar, header, etc.)
│   ├── pages/          # Páginas da aplicação
│   ├── lib/            # Utilitários (queryClient, auth-context)
│   └── hooks/          # Custom hooks
├── server/
│   ├── routes.ts       # Todas as rotas da API
│   ├── storage.ts      # Camada de persistência (DatabaseStorage)
│   └── index.ts        # Configuração do Express
└── shared/
    └── schema.ts       # Modelos de dados Drizzle + tipos TypeScript
```

### Modelos de Dados
- **users**: Usuários do sistema (id, username, password hash, role, etc.)
- **parties**: Partidos políticos (id, name, abbreviation, number, color)
- **candidates**: Candidatos (id, name, nickname, number, partyId)
- **scenarios**: Cenários eleitorais (id, name, description, validVotes, availableSeats)
- **simulations**: Resultados de simulações (id, scenarioId, name, results JSON)
- **auditLogs**: Trilha de auditoria (id, userId, action, entity, details, timestamp)
- **scenarioVotes**: Votos por cenário (scenarioId, partyId, candidateId, votes)

### Funções de Usuário (RBAC)
- **admin**: Acesso completo (gerenciar usuários, partidos, candidatos, cenários, simulações, IA, auditoria)
- **analyst**: Pode executar simulações, usar previsões IA, visualizar dados
- **viewer**: Apenas visualização de dados e simulações

### Endpoints da API
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Usuário atual
- `GET/POST/PUT/DELETE /api/parties` - CRUD de partidos
- `GET/POST/PUT/DELETE /api/candidates` - CRUD de candidatos
- `GET/POST/PUT/DELETE /api/scenarios` - CRUD de cenários
- `GET/POST /api/simulations` - Simulações
- `POST /api/electoral/calculate` - Cálculo eleitoral (backend)
- `POST /api/predictions` - Previsões com IA (admin/analyst)
- `GET /api/audit` - Logs de auditoria (admin)
- `GET /api/stats` - Estatísticas do dashboard
- `GET /api/analytics/summary` - Resumo analítico (votos, candidatos, partidos, municípios)
- `GET /api/analytics/votes-by-party` - Votos agregados por partido
- `GET /api/analytics/top-candidates` - Candidatos mais votados
- `GET /api/analytics/votes-by-state` - Votos por estado
- `GET /api/analytics/votes-by-municipality` - Votos por município
- `GET /api/analytics/election-years` - Anos eleitorais disponíveis
- `GET /api/analytics/states` - Estados disponíveis
- `GET /api/analytics/election-types` - Tipos de eleição disponíveis
- `GET /api/analytics/positions` - Cargos disponíveis
- `GET /api/analytics/parties-list` - Lista de partidos disponíveis
- `GET /api/analytics/advanced` - Análise avançada com múltiplos filtros
- `POST /api/analytics/compare` - Comparação entre anos/estados
- `GET /api/analytics/export/csv` - Exportação de relatórios em CSV
- `GET/POST/PUT/DELETE /api/reports` - CRUD de relatórios salvos
- `POST /api/ai/assistant` - Assistente IA para perguntas sobre dados
- `POST /api/ai/predict-historical` - Previsões baseadas em histórico
- `POST /api/ai/anomalies` - Detecção de anomalias estatísticas
- `POST /api/ai/turnout` - Previsão de comparecimento eleitoral
- `POST /api/ai/candidate-success` - Probabilidade de sucesso de candidatos
- `POST /api/ai/party-performance` - Previsão de desempenho partidário
- `POST /api/ai/electoral-insights` - Insights estratégicos eleitorais
- `POST /api/ai/sentiment` - Análise de sentimento de notícias/posts
- `POST /api/imports/tse/url` - Importação via URL do TSE

### Sistema Eleitoral Brasileiro
O sistema implementa o cálculo proporcional brasileiro:
1. **Quociente Eleitoral** = Votos Válidos / Vagas Disponíveis
2. **Quociente Partidário** = Votos do Partido / Quociente Eleitoral
3. **Distribuição inicial**: Cada partido recebe floor(Quociente Partidário) vagas
4. **Distribuição de sobras**: Método D'Hondt para vagas restantes

### Credenciais Padrão
- **Usuário**: admin
- **Senha**: admin123

## Preferências de Desenvolvimento
- Usar TypeScript em todo o código
- Seguir padrões do shadcn/ui para componentes
- Validação com Zod schemas
- Design institucional inspirado no TSE (cores: #003366 azul, #FFD700 dourado)
- Suporte a tema claro/escuro
