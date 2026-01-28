-- SimulaVoto - Migration Script January 2026
-- Execute este script no Supabase SQL Editor para atualizar um banco existente
-- Este script adiciona tabelas que não existem, sem afetar dados existentes
--
-- IMPORTANTE: Para instalações LIMPAS, use apenas o init-db.sql
-- Este migration é APENAS para atualizar bancos de versões anteriores

-- ===========================================
-- TABELAS DE NOTIFICAÇÕES IN-APP
-- ===========================================

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  severity TEXT DEFAULT 'info',
  related_entity_type TEXT,
  related_entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_idx ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS in_app_notifications_read_idx ON in_app_notifications(is_read);
CREATE INDEX IF NOT EXISTS in_app_notifications_created_at_idx ON in_app_notifications(created_at);
CREATE INDEX IF NOT EXISTS in_app_notifications_type_idx ON in_app_notifications(type);
CREATE INDEX IF NOT EXISTS in_app_notifications_severity_idx ON in_app_notifications(severity);

-- ===========================================
-- TABELAS DO IBGE
-- ===========================================

CREATE TABLE IF NOT EXISTS ibge_municipios (
  id SERIAL PRIMARY KEY,
  codigo_ibge VARCHAR(7) NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  uf VARCHAR(2) NOT NULL,
  uf_nome TEXT,
  regiao_nome TEXT,
  mesorregiao TEXT,
  microrregiao TEXT,
  area_km2 DECIMAL(12, 3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ibge_municipios_codigo_idx ON ibge_municipios(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_municipios_uf_idx ON ibge_municipios(uf);
CREATE INDEX IF NOT EXISTS municipio_uf_idx ON ibge_municipios(uf);
CREATE INDEX IF NOT EXISTS municipio_codigo_idx ON ibge_municipios(codigo_ibge);

CREATE TABLE IF NOT EXISTS ibge_populacao (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES ibge_municipios(id) ON DELETE CASCADE,
  codigo_ibge VARCHAR(7) NOT NULL,
  ano INTEGER NOT NULL,
  populacao BIGINT,
  fonte TEXT DEFAULT 'IBGE/SIDRA',
  tabela_sidra VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS ibge_populacao_municipio_idx ON ibge_populacao(municipio_id);
CREATE INDEX IF NOT EXISTS ibge_populacao_codigo_idx ON ibge_populacao(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_populacao_ano_idx ON ibge_populacao(ano);

CREATE TABLE IF NOT EXISTS ibge_indicadores (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES ibge_municipios(id) ON DELETE CASCADE,
  codigo_ibge VARCHAR(7) NOT NULL,
  ano INTEGER NOT NULL,
  idh DECIMAL(6, 4),
  idh_renda DECIMAL(6, 4),
  idh_educacao DECIMAL(6, 4),
  idh_longevidade DECIMAL(6, 4),
  gini DECIMAL(6, 4),
  pib_total DECIMAL(18, 2),
  pib_per_capita DECIMAL(14, 2),
  renda_media DECIMAL(14, 2),
  taxa_alfabetizacao DECIMAL(6, 2),
  taxa_escolarizacao DECIMAL(6, 2),
  expectativa_vida DECIMAL(6, 2),
  mortalidade_infantil DECIMAL(8, 4),
  taxa_desemprego DECIMAL(6, 2),
  taxa_informalidade DECIMAL(6, 2),
  acesso_agua DECIMAL(6, 2),
  acesso_esgoto DECIMAL(6, 2),
  acesso_energia DECIMAL(6, 2),
  acesso_internet DECIMAL(6, 2),
  fonte TEXT DEFAULT 'IBGE/SIDRA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS ibge_indicadores_municipio_idx ON ibge_indicadores(municipio_id);
CREATE INDEX IF NOT EXISTS ibge_indicadores_codigo_idx ON ibge_indicadores(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_indicadores_ano_idx ON ibge_indicadores(ano);
-- Nota: índice de IDH removido pois nome da coluna varia entre versões (idh vs idhm)

CREATE TABLE IF NOT EXISTS ibge_import_jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT DEFAULT 'IBGE/SIDRA',
  parameters JSONB,
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ibge_import_jobs_status_idx ON ibge_import_jobs(status);
CREATE INDEX IF NOT EXISTS ibge_import_jobs_type_idx ON ibge_import_jobs(type);
CREATE INDEX IF NOT EXISTS ibge_import_status_idx ON ibge_import_jobs(status);
CREATE INDEX IF NOT EXISTS ibge_import_type_idx ON ibge_import_jobs(type);

-- ===========================================
-- TABELAS DE CONFIGURAÇÃO DE ALERTAS
-- ===========================================

CREATE TABLE IF NOT EXISTS alert_configurations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  threshold_low DECIMAL(5, 4) DEFAULT 0.2,
  threshold_medium DECIMAL(5, 4) DEFAULT 0.3,
  threshold_high DECIMAL(5, 4) DEFAULT 0.4,
  threshold_critical DECIMAL(5, 4) DEFAULT 0.5,
  email_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  rate_limit_minutes INTEGER DEFAULT 60,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS alert_config_user_idx ON alert_configurations(user_id);
CREATE INDEX IF NOT EXISTS alert_config_entity_idx ON alert_configurations(entity_type, entity_id);

-- ===========================================
-- TABELAS DE ANÁLISE DE SENTIMENTO
-- ===========================================

CREATE TABLE IF NOT EXISTS sentiment_data_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'news',
  url TEXT,
  country TEXT DEFAULT 'BR',
  language TEXT DEFAULT 'pt',
  active BOOLEAN DEFAULT true,
  fetch_frequency_hours INTEGER DEFAULT 6,
  last_fetched_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS sentiment_articles (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES sentiment_data_sources(id) ON DELETE SET NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  summary TEXT,
  url TEXT,
  author TEXT,
  published_at TIMESTAMP,
  source_type TEXT NOT NULL DEFAULT 'news',
  country TEXT DEFAULT 'BR',
  language TEXT DEFAULT 'pt',
  parties_mentioned TEXT[] DEFAULT '{}',
  candidates_mentioned TEXT[] DEFAULT '{}',
  sentiment TEXT,
  sentiment_score DECIMAL(5, 4),
  sentiment_confidence DECIMAL(5, 4),
  topics TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  analyzed BOOLEAN DEFAULT false,
  analyzed_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(url)
);

CREATE INDEX IF NOT EXISTS sentiment_articles_source_idx ON sentiment_articles(source_id);
CREATE INDEX IF NOT EXISTS sentiment_articles_published_idx ON sentiment_articles(published_at);
CREATE INDEX IF NOT EXISTS sentiment_articles_sentiment_idx ON sentiment_articles(sentiment);

CREATE TABLE IF NOT EXISTS sentiment_analysis_results (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  analysis_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentiment_score DECIMAL(5, 4) DEFAULT 0,
  sentiment_label TEXT DEFAULT 'neutral',
  confidence DECIMAL(5, 4) DEFAULT 0.8,
  mention_count INTEGER DEFAULT 0,
  source_breakdown JSONB DEFAULT '{}',
  top_keywords JSONB DEFAULT '[]',
  sample_mentions JSONB DEFAULT '[]',
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS sentiment_results_entity_idx ON sentiment_analysis_results(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_results_date_idx ON sentiment_analysis_results(analysis_date);
CREATE INDEX IF NOT EXISTS sentiment_entity_idx ON sentiment_analysis_results(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_date_idx ON sentiment_analysis_results(analysis_date);

CREATE TABLE IF NOT EXISTS sentiment_keywords (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  sentiment TEXT DEFAULT 'neutral',
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS sentiment_keywords_entity_idx ON sentiment_keywords(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_keywords_keyword_idx ON sentiment_keywords(keyword);

CREATE TABLE IF NOT EXISTS sentiment_crisis_alerts (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  alert_type TEXT NOT NULL DEFAULT 'negative_spike',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL DEFAULT 'Alerta de Sentimento',
  description TEXT,
  sentiment_before DECIMAL(5, 4),
  sentiment_after DECIMAL(5, 4),
  sentiment_change DECIMAL(5, 4),
  mention_count INTEGER DEFAULT 0,
  trigger_article_ids JSONB DEFAULT '[]',
  trigger_keywords JSONB DEFAULT '[]',
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by VARCHAR REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  resolution_notes TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS sentiment_alerts_entity_idx ON sentiment_crisis_alerts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_alerts_severity_idx ON sentiment_crisis_alerts(severity);
CREATE INDEX IF NOT EXISTS sentiment_alerts_acknowledged_idx ON sentiment_crisis_alerts(is_acknowledged);
CREATE INDEX IF NOT EXISTS crisis_alerts_type_idx ON sentiment_crisis_alerts(alert_type);

CREATE TABLE IF NOT EXISTS sentiment_monitoring_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  entity_types TEXT[] DEFAULT '{}',
  entity_ids TEXT[] DEFAULT '{}',
  source_filters JSONB DEFAULT '{}',
  alert_thresholds JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS monitoring_sessions_user_idx ON sentiment_monitoring_sessions(user_id);

CREATE TABLE IF NOT EXISTS sentiment_comparison_snapshots (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  entity_configs JSONB NOT NULL,
  comparison_data JSONB NOT NULL,
  ai_narrative TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS comparison_snapshots_user_idx ON sentiment_comparison_snapshots(user_id);

CREATE TABLE IF NOT EXISTS article_entity_mentions (
  id SERIAL PRIMARY KEY,
  article_id INTEGER REFERENCES sentiment_articles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  mention_count INTEGER DEFAULT 1,
  sentiment TEXT,
  sentiment_score DECIMAL(5, 4),
  context_snippets JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS entity_mentions_article_idx ON article_entity_mentions(article_id);
CREATE INDEX IF NOT EXISTS entity_mentions_entity_idx ON article_entity_mentions(entity_type, entity_id);

-- ===========================================
-- TABELAS DE DASHBOARDS PERSONALIZADOS
-- ===========================================

CREATE TABLE IF NOT EXISTS custom_dashboards (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB DEFAULT '{}',
  widgets JSONB DEFAULT '[]',
  filters JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS custom_dashboards_user_idx ON custom_dashboards(user_id);
CREATE INDEX IF NOT EXISTS custom_dashboards_public_idx ON custom_dashboards(is_public);

-- ===========================================
-- TABELAS DE SUGESTÕES AI
-- ===========================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  relevance_score DECIMAL(5, 4) DEFAULT 0.5,
  context_data JSONB DEFAULT '{}',
  is_applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMP,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_suggestions_user_idx ON ai_suggestions(user_id);
CREATE INDEX IF NOT EXISTS ai_suggestions_type_idx ON ai_suggestions(suggestion_type);

-- ===========================================
-- TABELAS DE CAMPANHAS
-- ===========================================

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  candidate_id INTEGER,
  election_year INTEGER NOT NULL,
  election_type TEXT NOT NULL,
  target_position TEXT,
  target_region TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  budget DECIMAL(14, 2),
  goals JSONB DEFAULT '{}',
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaigns_year_idx ON campaigns(election_year);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);
CREATE INDEX IF NOT EXISTS campaigns_created_by_idx ON campaigns(created_by);

CREATE TABLE IF NOT EXISTS campaign_team_members (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  permissions JSONB DEFAULT '{}',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_team_campaign_idx ON campaign_team_members(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_team_user_idx ON campaign_team_members(user_id);

CREATE TABLE IF NOT EXISTS campaign_activities (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  activity_type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  scheduled_date TIMESTAMP,
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  location TEXT,
  budget_allocated DECIMAL(12, 2),
  budget_spent DECIMAL(12, 2),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_activities_campaign_idx ON campaign_activities(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_activities_status_idx ON campaign_activities(status);
CREATE INDEX IF NOT EXISTS campaign_activities_type_idx ON campaign_activities(activity_type);
CREATE INDEX IF NOT EXISTS campaign_activities_scheduled_idx ON campaign_activities(scheduled_date);

CREATE TABLE IF NOT EXISTS campaign_activity_assignees (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER REFERENCES campaign_activities(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS activity_assignees_activity_idx ON campaign_activity_assignees(activity_id);
CREATE INDEX IF NOT EXISTS activity_assignees_user_idx ON campaign_activity_assignees(user_id);

CREATE TABLE IF NOT EXISTS campaign_kpi_goals (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  kpi_name TEXT NOT NULL,
  kpi_category TEXT DEFAULT 'general',
  target_value DECIMAL(14, 2) NOT NULL,
  current_value DECIMAL(14, 2) DEFAULT 0,
  baseline_value DECIMAL(14, 2) DEFAULT 0,
  unit TEXT DEFAULT 'count',
  priority TEXT DEFAULT 'medium',
  rationale TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(5, 4),
  tracking_method TEXT,
  measurement_frequency TEXT DEFAULT 'weekly',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_kpi_campaign_idx ON campaign_kpi_goals(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_kpi_category_idx ON campaign_kpi_goals(kpi_category);

-- ===========================================
-- TABELAS DE PREVISÕES E FORECASTS
-- ===========================================

CREATE TABLE IF NOT EXISTS forecast_runs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  forecast_type TEXT NOT NULL,
  parameters JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS forecast_runs_user_idx ON forecast_runs(user_id);
CREATE INDEX IF NOT EXISTS forecast_runs_type_idx ON forecast_runs(forecast_type);
CREATE INDEX IF NOT EXISTS forecast_runs_status_idx ON forecast_runs(status);

CREATE TABLE IF NOT EXISTS forecast_results (
  id SERIAL PRIMARY KEY,
  forecast_run_id INTEGER REFERENCES forecast_runs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  predicted_value DECIMAL(14, 4),
  confidence_low DECIMAL(14, 4),
  confidence_high DECIMAL(14, 4),
  confidence_level DECIMAL(5, 4) DEFAULT 0.95,
  methodology TEXT,
  factors JSONB DEFAULT '[]',
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS forecast_results_run_idx ON forecast_results(forecast_run_id);
CREATE INDEX IF NOT EXISTS forecast_results_entity_idx ON forecast_results(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS forecast_swing_regions (
  id SERIAL PRIMARY KEY,
  forecast_run_id INTEGER REFERENCES forecast_runs(id) ON DELETE CASCADE,
  region_code TEXT NOT NULL,
  region_name TEXT NOT NULL,
  region_type TEXT NOT NULL,
  swing_score DECIMAL(5, 4),
  historical_volatility DECIMAL(5, 4),
  demographic_factors JSONB DEFAULT '{}',
  ai_insights TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS swing_regions_run_idx ON forecast_swing_regions(forecast_run_id);
CREATE INDEX IF NOT EXISTS swing_regions_code_idx ON forecast_swing_regions(region_code);

-- ===========================================
-- TABELAS DE RELATÓRIOS AUTOMATIZADOS
-- ===========================================

CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL,
  config JSONB NOT NULL,
  output_format TEXT DEFAULT 'pdf',
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS report_templates_type_idx ON report_templates(report_type);
CREATE INDEX IF NOT EXISTS report_templates_created_by_idx ON report_templates(created_by);

CREATE TABLE IF NOT EXISTS report_schedules (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL,
  cron_expression TEXT,
  next_run_at TIMESTAMP,
  last_run_at TIMESTAMP,
  active BOOLEAN DEFAULT true,
  parameters JSONB DEFAULT '{}',
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS report_schedules_template_idx ON report_schedules(template_id);
CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx ON report_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS report_runs (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES report_schedules(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output_url TEXT,
  output_size INTEGER,
  error_message TEXT,
  parameters JSONB DEFAULT '{}',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS report_runs_schedule_idx ON report_runs(schedule_id);
CREATE INDEX IF NOT EXISTS report_runs_status_idx ON report_runs(status);

CREATE TABLE IF NOT EXISTS report_recipients (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES report_schedules(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS report_recipients_schedule_idx ON report_recipients(schedule_id);

-- ===========================================
-- TABELAS DE VALIDAÇÃO DE IMPORTAÇÃO
-- ===========================================

CREATE TABLE IF NOT EXISTS import_validation_runs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER,
  validation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_records INTEGER DEFAULT 0,
  valid_records INTEGER DEFAULT 0,
  invalid_records INTEGER DEFAULT 0,
  quality_score DECIMAL(5, 4),
  ai_analysis TEXT,
  recommendations JSONB DEFAULT '[]',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_runs_batch_idx ON import_validation_runs(batch_id);
CREATE INDEX IF NOT EXISTS validation_runs_status_idx ON import_validation_runs(status);

CREATE TABLE IF NOT EXISTS import_validation_issues (
  id SERIAL PRIMARY KEY,
  validation_run_id INTEGER REFERENCES import_validation_runs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'warning',
  issue_type TEXT NOT NULL,
  field_name TEXT,
  record_identifier TEXT,
  expected_value TEXT,
  actual_value TEXT,
  message TEXT NOT NULL,
  suggestion TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_issues_run_idx ON import_validation_issues(validation_run_id);
CREATE INDEX IF NOT EXISTS validation_issues_severity_idx ON import_validation_issues(severity);
CREATE INDEX IF NOT EXISTS validation_issues_resolved_idx ON import_validation_issues(resolved);

-- ===========================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- ===========================================

SELECT 'Migration completed successfully!' AS status;
