# Objective
Refatoração estrutural completa do SimulaVoto: modularizar o schema compartilhado, separar rotas do backend em controller/service, e dividir páginas grandes do frontend em componentes menores. Manter compatibilidade total com imports existentes — nenhuma funcionalidade será alterada, apenas reorganização de código.

# Tasks

### T001: Modularizar shared/schema.ts (2349 linhas → ~10 arquivos)
- **Blocked By**: []
- **Details**:
  - Criar diretório `shared/schema/`
  - Dividir em arquivos por domínio:
    - `shared/schema/users.ts` — users, user_sessions, audit_logs (~100 linhas)
    - `shared/schema/electoral.ts` — parties, candidates, alliances, alliance_parties, scenarios, scenario_votes, scenario_candidates, simulations (~200 linhas)
    - `shared/schema/tse.ts` — tse_import_jobs, tse_candidate_votes, tse_import_errors, tse_import_batches, tse_import_batch_rows, tse_electoral_statistics, tse_party_votes (~350 linhas)
    - `shared/schema/summaries.ts` — summary_party_votes, summary_candidate_votes, summary_state_votes (~70 linhas)
    - `shared/schema/ai-predictions.ts` — ai_predictions, ai_suggestions, ai_sentiment_data, forecast_runs, forecast_results, forecast_swing_regions, prediction_scenarios, candidate_comparisons, event_impact_predictions, scenario_simulations (~350 linhas)
    - `shared/schema/sentiment.ts` — sentiment_data_sources, sentiment_articles, sentiment_analysis_results, sentiment_keywords, sentiment_crisis_alerts, sentiment_monitoring_sessions, sentiment_comparison_snapshots, article_entity_mentions, alert_configurations, in_app_notifications (~300 linhas)
    - `shared/schema/reports.ts` — saved_reports, projection_reports, report_templates, report_schedules, report_runs, report_recipients, semantic_documents, semantic_search_queries (~250 linhas)
    - `shared/schema/campaigns.ts` — campaigns, campaign_budgets, campaign_resources, campaign_metrics, campaign_activities, campaign_team_members, activity_assignees, ai_kpi_goals, campaign_notifications, campaign_insight_sessions, high_impact_segments, message_strategies, campaign_impact_predictions, campaign_insight_reports (~400 linhas)
    - `shared/schema/ibge.ts` — ibge_municipios, ibge_populacao, ibge_indicadores, ibge_import_jobs (~120 linhas)
    - `shared/schema/ai-config.ts` — ai_providers, ai_task_configs (~50 linhas)
    - `shared/schema/constants.ts` — ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS e demais constantes/tipos exportados
  - Criar `shared/schema/index.ts` que re-exporta tudo (`export * from './users'`, etc.)
  - Atualizar `shared/schema.ts` para apenas re-exportar de `shared/schema/index.ts` (manter compatibilidade)
  - Files: `shared/schema.ts`, `shared/schema/*.ts` (novos)
  - Acceptance: Todos os imports `from "@shared/schema"` continuam funcionando sem alterações. App compila e inicia sem erros.

### T002: Separar server/routes/ai.ts em controller/service (2752 linhas)
- **Blocked By**: [T001]
- **Details**:
  - Criar `server/services/` diretório
  - Extrair lógica de negócio para services:
    - `server/services/prediction-service.ts` — lógica de predict, predict-historical, anomalies, turnout, candidate-success, party-performance, electoral-insights (~400 linhas)
    - `server/services/comparison-service.ts` — candidate comparisons, event impacts, scenario simulations (~300 linhas)
    - `server/services/report-service.ts` — projection reports, report templates, schedules, runs (~400 linhas)
    - `server/services/dashboard-service.ts` — dashboards CRUD, AI suggestions (~200 linhas)
  - As rotas em `ai.ts` ficam finas (validação + chamada do service + resposta)
  - Mover lógica de sentiment para `server/services/sentiment-service.ts` se ainda não estiver separada
  - Files: `server/routes/ai.ts`, `server/services/*.ts` (novos)
  - Acceptance: Todos endpoints `/api/ai/*` continuam funcionando. Nenhuma mudança de API.

### T003: Separar server/routes/tse-import.ts em controller/service (2516 linhas)
- **Blocked By**: [T001]
- **Details**:
  - Extrair processadores de importação:
    - `server/services/tse-import-service.ts` — processCSVImportInternal, processDetalheVotacaoImportInternal, processPartidoVotacaoImportInternal, parseValue, mapParsedRowToVote, postImportMaintenance (~1300 linhas)
    - `server/services/tse-queue-service.ts` — activeImportJobs, tseImportQueue, addToTseQueue, processNextTseJob, getTseQueueStatus, isJobCancelled (~120 linhas)
  - Rotas em `tse-import.ts` ficam finas
  - Files: `server/routes/tse-import.ts`, `server/services/tse-import-service.ts`, `server/services/tse-queue-service.ts` (novos)
  - Acceptance: Todos endpoints `/api/imports/tse/*` continuam funcionando. Import TSE funciona corretamente.

### T004: Dividir client/src/pages/campaigns.tsx (2300 linhas)
- **Blocked By**: []
- **Details**:
  - Criar `client/src/pages/campaigns/` diretório
  - Extrair componentes:
    - `campaigns/CampaignList.tsx` — lista de campanhas com cards
    - `campaigns/CampaignDetail.tsx` — view de detalhe com tabs
    - `campaigns/BudgetTab.tsx` — gestão de orçamento com charts
    - `campaigns/ActivitiesTab.tsx` — calendário e atividades
    - `campaigns/MetricsTab.tsx` — KPIs e métricas
    - `campaigns/TeamTab.tsx` — gestão de equipe
    - `campaigns/CampaignDialogs.tsx` — todos os dialogs de criação/edição
  - Extrair hooks:
    - `client/src/hooks/use-campaigns.ts` — queries e mutations de campanhas
  - Manter `campaigns.tsx` como wrapper fino que importa componentes
  - Files: `client/src/pages/campaigns.tsx`, `client/src/pages/campaigns/*.tsx` (novos), `client/src/hooks/use-campaigns.ts` (novo)
  - Acceptance: Página de campanhas funciona identicamente. Todas as tabs e dialogs funcionam.

### T005: Dividir client/src/pages/tse-import.tsx (2491 linhas)
- **Blocked By**: []
- **Details**:
  - Criar `client/src/pages/tse-import/` diretório
  - Extrair componentes:
    - `tse-import/ImportControls.tsx` — controles de importação (ano, UF, cargo)
    - `tse-import/JobsTable.tsx` — tabela de jobs com status
    - `tse-import/ProgressMonitor.tsx` — monitoramento de progresso em tempo real
    - `tse-import/BatchDialog.tsx` — dialog de batches com retry
    - `tse-import/ValidationDialog.tsx` — dialog de validação de dados
    - `tse-import/HistoricalImport.tsx` — importação de dados históricos
  - Extrair hooks:
    - `client/src/hooks/use-tse-import.ts` — queries, mutations e WebSocket hook
  - Files: `client/src/pages/tse-import.tsx`, `client/src/pages/tse-import/*.tsx` (novos), `client/src/hooks/use-tse-import.ts` (novo)
  - Acceptance: Página de importação TSE funciona identicamente. WebSocket e progresso em tempo real funcionam.

### T006: Dividir client/src/pages/predictions.tsx (1965 linhas)
- **Blocked By**: []
- **Details**:
  - Criar `client/src/pages/predictions/` diretório
  - Extrair componentes:
    - `predictions/QuickPrediction.tsx` — predição rápida
    - `predictions/ScenarioAnalysis.tsx` — análise avançada de cenários
    - `predictions/CandidateComparison.tsx` — comparação de candidatos
    - `predictions/EventImpact.tsx` — impacto de eventos
    - `predictions/WhatIfSimulation.tsx` — simulação "E se?"
    - `predictions/PredictionCharts.tsx` — componentes de gráficos compartilhados
  - Extrair hooks:
    - `client/src/hooks/use-predictions.ts` — queries e mutations de predições
  - Files: `client/src/pages/predictions.tsx`, `client/src/pages/predictions/*.tsx` (novos), `client/src/hooks/use-predictions.ts` (novo)
  - Acceptance: Página de predições funciona identicamente. Todas as tabs e gráficos funcionam.

### T007: Verificação final e atualização de documentação
- **Blocked By**: [T001, T002, T003, T004, T005, T006]
- **Details**:
  - Compilar e iniciar a aplicação completa
  - Verificar que não há erros de TypeScript
  - Testar endpoints críticos via curl
  - Atualizar `replit.md` com a nova estrutura de diretórios
  - Bump version para 1.6.0 com changelog da refatoração
  - Files: `replit.md`, `version.json`
  - Acceptance: App compila, inicia e funciona sem erros. Documentação atualizada.

# Execution Strategy
- **Fase 1 (Schema):** T001 primeiro — base para tudo
- **Fase 2 (Backend):** T002 e T003 em paralelo — dependem apenas de T001
- **Fase 3 (Frontend):** T004, T005, T006 em paralelo — independentes entre si e do backend
- **Fase 4 (Validação):** T007 — verificação final

# Riscos e Mitigações
- **Risco:** Imports circulares no schema modularizado → Mitigação: relações Drizzle definidas em arquivo separado se necessário
- **Risco:** Referências cruzadas entre services → Mitigação: cada service é autossuficiente, usa storage/db diretamente
- **Risco:** Estado compartilhado em rotas (ex: activeImportJobs) → Mitigação: exportado do service, importado pela rota
- **Risco:** React context/state perdido na componentização → Mitigação: hooks customizados centralizam estado

# Nota sobre Testes
A análise menciona ausência de testes. Não incluí setup de framework de testes neste plano pois é um esforço separado e significativo. Recomendo como próximo passo após esta refatoração.
