-- SimulaVoto - Migration Script January 2026
-- Execute este script no Supabase SQL Editor para atualizar um banco existente
-- Este script adiciona tabelas que não existem, sem afetar dados existentes

-- ===========================================
-- TABELAS DE NOTIFICAÇÕES IN-APP
-- ===========================================

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  entity_type TEXT,
  entity_id INTEGER,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP,
  action_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_idx ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS in_app_notifications_read_idx ON in_app_notifications(read);
CREATE INDEX IF NOT EXISTS in_app_notifications_created_at_idx ON in_app_notifications(created_at);

-- ===========================================
-- TABELAS DO IBGE
-- ===========================================

CREATE TABLE IF NOT EXISTS ibge_municipios (
  id SERIAL PRIMARY KEY,
  codigo_ibge INTEGER NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  uf TEXT NOT NULL,
  codigo_uf INTEGER NOT NULL,
  regiao TEXT NOT NULL,
  mesorregiao TEXT,
  microrregiao TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  area_km2 DECIMAL(12, 3),
  capital BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ibge_municipios_codigo_idx ON ibge_municipios(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_municipios_uf_idx ON ibge_municipios(uf);
CREATE INDEX IF NOT EXISTS ibge_municipios_regiao_idx ON ibge_municipios(regiao);

CREATE TABLE IF NOT EXISTS ibge_populacao (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES ibge_municipios(id) ON DELETE CASCADE,
  codigo_ibge INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  populacao_total INTEGER,
  populacao_urbana INTEGER,
  populacao_rural INTEGER,
  populacao_masculina INTEGER,
  populacao_feminina INTEGER,
  densidade_demografica DECIMAL(12, 4),
  taxa_crescimento DECIMAL(8, 4),
  fonte TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS ibge_populacao_municipio_idx ON ibge_populacao(municipio_id);
CREATE INDEX IF NOT EXISTS ibge_populacao_codigo_idx ON ibge_populacao(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_populacao_ano_idx ON ibge_populacao(ano);

CREATE TABLE IF NOT EXISTS ibge_indicadores (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES ibge_municipios(id) ON DELETE CASCADE,
  codigo_ibge INTEGER NOT NULL,
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
  fonte TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS ibge_indicadores_municipio_idx ON ibge_indicadores(municipio_id);
CREATE INDEX IF NOT EXISTS ibge_indicadores_codigo_idx ON ibge_indicadores(codigo_ibge);
CREATE INDEX IF NOT EXISTS ibge_indicadores_ano_idx ON ibge_indicadores(ano);
CREATE INDEX IF NOT EXISTS ibge_indicadores_idh_idx ON ibge_indicadores(idh);

CREATE TABLE IF NOT EXISTS ibge_import_jobs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ibge_import_jobs_status_idx ON ibge_import_jobs(status);
CREATE INDEX IF NOT EXISTS ibge_import_jobs_type_idx ON ibge_import_jobs(job_type);

-- ===========================================
-- TABELAS DE CONFIGURAÇÃO DE ALERTAS
-- ===========================================

CREATE TABLE IF NOT EXISTS alert_configurations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
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
  entity_id INTEGER,
  entity_name TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  total_articles INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  average_score DECIMAL(5, 4),
  score_trend DECIMAL(5, 4),
  sentiment_distribution JSONB,
  top_topics JSONB,
  top_keywords JSONB,
  sources_breakdown JSONB,
  ai_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS sentiment_results_entity_idx ON sentiment_analysis_results(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_results_period_idx ON sentiment_analysis_results(period_start, period_end);

CREATE TABLE IF NOT EXISTS sentiment_keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  entity_name TEXT,
  frequency INTEGER DEFAULT 1,
  sentiment TEXT,
  sentiment_score DECIMAL(5, 4),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(keyword, entity_type, entity_id, period_start)
);

CREATE INDEX IF NOT EXISTS sentiment_keywords_keyword_idx ON sentiment_keywords(keyword);
CREATE INDEX IF NOT EXISTS sentiment_keywords_entity_idx ON sentiment_keywords(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS sentiment_crisis_alerts (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  entity_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  sentiment_change DECIMAL(5, 4),
  previous_score DECIMAL(5, 4),
  current_score DECIMAL(5, 4),
  trigger_articles JSONB,
  ai_analysis TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by VARCHAR REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS crisis_alerts_entity_idx ON sentiment_crisis_alerts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS crisis_alerts_severity_idx ON sentiment_crisis_alerts(severity);
CREATE INDEX IF NOT EXISTS crisis_alerts_acknowledged_idx ON sentiment_crisis_alerts(acknowledged);

CREATE TABLE IF NOT EXISTS sentiment_monitoring_sessions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  entities JSONB NOT NULL DEFAULT '[]',
  source_filters JSONB,
  alert_thresholds JSONB,
  active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sentiment_comparison_snapshots (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sentiment_monitoring_sessions(id) ON DELETE CASCADE,
  entities_data JSONB NOT NULL,
  comparison_analysis TEXT,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS article_entity_mentions (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES sentiment_articles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  entity_name TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  sentiment TEXT,
  sentiment_score DECIMAL(5, 4),
  context_snippets JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS entity_mentions_article_idx ON article_entity_mentions(article_id);
CREATE INDEX IF NOT EXISTS entity_mentions_entity_idx ON article_entity_mentions(entity_type, entity_id);

-- ===========================================
-- TABELAS DE DASHBOARDS CUSTOMIZADOS
-- ===========================================

CREATE TABLE IF NOT EXISTS custom_dashboards (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB NOT NULL DEFAULT '[]',
  filters JSONB,
  widgets JSONB,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS custom_dashboards_created_by_idx ON custom_dashboards(created_by);
CREATE INDEX IF NOT EXISTS custom_dashboards_public_idx ON custom_dashboards(is_public);

-- ===========================================
-- TABELAS DE SUGESTÕES IA
-- ===========================================

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id SERIAL PRIMARY KEY,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  parameters JSONB,
  relevance_score DECIMAL(5, 4),
  context JSONB,
  accepted BOOLEAN,
  accepted_at TIMESTAMP,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ai_suggestions_type_idx ON ai_suggestions(suggestion_type);
CREATE INDEX IF NOT EXISTS ai_suggestions_created_by_idx ON ai_suggestions(created_by);

-- ===========================================
-- TABELAS DE CAMPANHAS
-- ===========================================

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
  party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
  election_year INTEGER NOT NULL,
  election_type TEXT NOT NULL DEFAULT 'municipal',
  position TEXT NOT NULL,
  state TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  total_budget DECIMAL(14, 2) DEFAULT 0,
  spent_budget DECIMAL(14, 2) DEFAULT 0,
  goals JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS campaigns_candidate_idx ON campaigns(candidate_id);
CREATE INDEX IF NOT EXISTS campaigns_party_idx ON campaigns(party_id);
CREATE INDEX IF NOT EXISTS campaigns_year_idx ON campaigns(election_year);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

CREATE TABLE IF NOT EXISTS campaign_team_members (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  permissions JSONB,
  active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_team_campaign_idx ON campaign_team_members(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_team_user_idx ON campaign_team_members(user_id);

CREATE TABLE IF NOT EXISTS campaign_activities (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  activity_type TEXT NOT NULL DEFAULT 'event',
  status TEXT NOT NULL DEFAULT 'planned',
  priority TEXT DEFAULT 'medium',
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  location TEXT,
  budget_allocated DECIMAL(12, 2) DEFAULT 0,
  budget_spent DECIMAL(12, 2) DEFAULT 0,
  target_audience TEXT,
  expected_reach INTEGER,
  actual_reach INTEGER,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS campaign_activities_campaign_idx ON campaign_activities(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_activities_type_idx ON campaign_activities(activity_type);
CREATE INDEX IF NOT EXISTS campaign_activities_status_idx ON campaign_activities(status);
CREATE INDEX IF NOT EXISTS campaign_activities_dates_idx ON campaign_activities(start_date, end_date);

CREATE TABLE IF NOT EXISTS activity_assignees (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES campaign_activities(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES campaign_team_members(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(activity_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS activity_assignees_activity_idx ON activity_assignees(activity_id);
CREATE INDEX IF NOT EXISTS activity_assignees_member_idx ON activity_assignees(team_member_id);

CREATE TABLE IF NOT EXISTS campaign_budgets (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  allocated_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  spent_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_budgets_campaign_idx ON campaign_budgets(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  value DECIMAL(14, 4),
  previous_value DECIMAL(14, 4),
  target_value DECIMAL(14, 4),
  source TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_idx ON campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_metrics_date_idx ON campaign_metrics(metric_date);
CREATE INDEX IF NOT EXISTS campaign_metrics_type_idx ON campaign_metrics(metric_type);

CREATE TABLE IF NOT EXISTS campaign_resources (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  description TEXT,
  url TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS campaign_resources_campaign_idx ON campaign_resources(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_resources_type_idx ON campaign_resources(resource_type);

CREATE TABLE IF NOT EXISTS ai_kpi_goals (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  description TEXT,
  baseline_value DECIMAL(14, 4),
  current_value DECIMAL(14, 4),
  target_value DECIMAL(14, 4),
  unit TEXT,
  priority TEXT DEFAULT 'medium',
  ai_suggested BOOLEAN DEFAULT false,
  ai_rationale TEXT,
  ai_confidence DECIMAL(5, 4),
  status TEXT DEFAULT 'active',
  target_date TIMESTAMP,
  achieved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ai_kpi_goals_campaign_idx ON ai_kpi_goals(campaign_id);
CREATE INDEX IF NOT EXISTS ai_kpi_goals_status_idx ON ai_kpi_goals(status);
CREATE INDEX IF NOT EXISTS ai_kpi_goals_priority_idx ON ai_kpi_goals(priority);

CREATE TABLE IF NOT EXISTS campaign_notifications (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  in_app_notification_id INTEGER REFERENCES in_app_notifications(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_notifications_campaign_idx ON campaign_notifications(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_notifications_user_idx ON campaign_notifications(user_id);
CREATE INDEX IF NOT EXISTS campaign_notifications_read_idx ON campaign_notifications(read);

-- ===========================================
-- TABELAS DE INSIGHTS DE CAMPANHA
-- ===========================================

CREATE TABLE IF NOT EXISTS campaign_insight_sessions (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_analysis JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS high_impact_segments (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES campaign_insight_sessions(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,
  segment_type TEXT NOT NULL,
  description TEXT,
  demographic_profile JSONB,
  geographic_areas JSONB,
  impact_score DECIMAL(5, 4),
  conversion_potential DECIMAL(5, 4),
  volatility_score DECIMAL(5, 4),
  current_sentiment DECIMAL(5, 4),
  recommended_actions JSONB,
  ai_rationale TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS message_strategies (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES campaign_insight_sessions(id) ON DELETE CASCADE,
  segment_id INTEGER REFERENCES high_impact_segments(id) ON DELETE CASCADE,
  strategy_name TEXT NOT NULL,
  target_segment TEXT,
  tone TEXT,
  channels JSONB,
  key_messages JSONB,
  topics_to_emphasize JSONB,
  topics_to_avoid JSONB,
  timing_recommendations JSONB,
  expected_response DECIMAL(5, 4),
  ai_rationale TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_impact_predictions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES campaign_insight_sessions(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  investment_amount DECIMAL(14, 2),
  expected_roi DECIMAL(8, 4),
  predicted_vote_change DECIMAL(5, 4),
  confidence_interval_low DECIMAL(5, 4),
  confidence_interval_high DECIMAL(5, 4),
  key_assumptions JSONB,
  risk_factors JSONB,
  timeline JSONB,
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_insight_reports (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES campaign_insight_sessions(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  executive_summary TEXT,
  full_content JSONB,
  visualizations JSONB,
  recommendations JSONB,
  file_path TEXT,
  file_format TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ===========================================
-- TABELAS DE PREVISÕES AVANÇADAS
-- ===========================================

CREATE TABLE IF NOT EXISTS candidate_comparisons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  candidates JSONB NOT NULL DEFAULT '[]',
  election_year INTEGER,
  election_type TEXT,
  position TEXT,
  state TEXT,
  city TEXT,
  comparison_results JSONB,
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS event_impact_predictions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  event_date TIMESTAMP,
  affected_entities JSONB NOT NULL DEFAULT '[]',
  before_prediction JSONB,
  after_prediction JSONB,
  impact_analysis JSONB,
  ai_narrative TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS prediction_scenarios (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scenario_type TEXT NOT NULL DEFAULT 'what_if',
  base_conditions JSONB NOT NULL DEFAULT '{}',
  modified_conditions JSONB NOT NULL DEFAULT '{}',
  affected_entities JSONB DEFAULT '[]',
  prediction_results JSONB,
  ai_analysis TEXT,
  probability DECIMAL(5, 4),
  impact_severity TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- ===========================================
-- TABELAS DE RELATÓRIOS AUTOMATIZADOS
-- ===========================================

CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]',
  filters JSONB,
  sort_config JSONB,
  chart_config JSONB,
  template_content JSONB,
  format TEXT DEFAULT 'pdf',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  day_of_week INTEGER,
  day_of_month INTEGER,
  hour INTEGER DEFAULT 8,
  minute INTEGER DEFAULT 0,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  filters JSONB,
  active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_recipients (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS report_runs (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES report_schedules(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  file_path TEXT,
  file_size INTEGER,
  error_message TEXT,
  recipients_notified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- ===========================================
-- TABELAS TSE ADICIONAIS
-- ===========================================

CREATE TABLE IF NOT EXISTS tse_import_batches (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER NOT NULL REFERENCES tse_import_jobs(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL,
  start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_rows INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS tse_import_batches_job_idx ON tse_import_batches(import_job_id);
CREATE INDEX IF NOT EXISTS tse_import_batches_status_idx ON tse_import_batches(status);

CREATE TABLE IF NOT EXISTS tse_import_batch_rows (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES tse_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data TEXT,
  parsed_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS tse_import_batch_rows_batch_idx ON tse_import_batch_rows(batch_id);
CREATE INDEX IF NOT EXISTS tse_import_batch_rows_status_idx ON tse_import_batch_rows(status);

CREATE TABLE IF NOT EXISTS tse_party_votes (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER REFERENCES tse_import_jobs(id) ON DELETE CASCADE,
  ano_eleicao INTEGER,
  nr_turno INTEGER,
  sg_uf TEXT,
  cd_municipio INTEGER,
  nm_municipio TEXT,
  nr_zona INTEGER,
  cd_cargo INTEGER,
  ds_cargo TEXT,
  nr_partido INTEGER,
  sg_partido TEXT,
  nm_partido TEXT,
  qt_votos_legenda INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS tse_party_votes_job_idx ON tse_party_votes(import_job_id);
CREATE INDEX IF NOT EXISTS tse_party_votes_year_idx ON tse_party_votes(ano_eleicao);
CREATE INDEX IF NOT EXISTS tse_party_votes_state_idx ON tse_party_votes(sg_uf);

CREATE TABLE IF NOT EXISTS tse_electoral_statistics (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER REFERENCES tse_import_jobs(id) ON DELETE CASCADE,
  ano_eleicao INTEGER,
  nr_turno INTEGER,
  sg_uf TEXT,
  cd_municipio INTEGER,
  nm_municipio TEXT,
  cd_cargo INTEGER,
  ds_cargo TEXT,
  qt_aptos INTEGER,
  qt_comparecimento INTEGER,
  qt_abstencoes INTEGER,
  qt_votos_nominais INTEGER,
  qt_votos_legenda INTEGER,
  qt_votos_brancos INTEGER,
  qt_votos_nulos INTEGER,
  qt_votos_validos INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS tse_electoral_stats_job_idx ON tse_electoral_statistics(import_job_id);
CREATE INDEX IF NOT EXISTS tse_electoral_stats_year_idx ON tse_electoral_statistics(ano_eleicao);

CREATE TABLE IF NOT EXISTS scenario_simulations (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  simulation_type TEXT NOT NULL DEFAULT 'basic',
  parameters JSONB,
  results JSONB,
  ai_analysis TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS scenario_simulations_scenario_idx ON scenario_simulations(scenario_id);

-- ===========================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- ===========================================

SELECT 'Migration January 2026 completed successfully!' AS status;
