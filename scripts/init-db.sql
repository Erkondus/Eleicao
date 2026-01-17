-- SimulaVoto - Database Initialization Script for Supabase/PostgreSQL
-- Este script cria todas as tabelas necessárias para o sistema
-- Requer extensão pgvector para busca semântica

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===========================================
-- TABELAS PRINCIPAIS
-- ===========================================

-- Usuários do sistema
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Partidos políticos
CREATE TABLE IF NOT EXISTS parties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL UNIQUE,
  number INTEGER NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#003366',
  coalition TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Candidatos
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  number INTEGER NOT NULL,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  position TEXT NOT NULL DEFAULT 'vereador',
  biography TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Cenários eleitorais
CREATE TABLE IF NOT EXISTS scenarios (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_voters INTEGER NOT NULL,
  valid_votes INTEGER NOT NULL,
  available_seats INTEGER NOT NULL,
  position TEXT NOT NULL DEFAULT 'vereador',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Votos por cenário
CREATE TABLE IF NOT EXISTS scenario_votes (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  votes INTEGER NOT NULL DEFAULT 0
);

-- Candidatos por cenário
CREATE TABLE IF NOT EXISTS scenario_candidates (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  ballot_number INTEGER NOT NULL,
  nickname TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Simulações
CREATE TABLE IF NOT EXISTS simulations (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  electoral_quotient DECIMAL(12, 4),
  results JSONB,
  ai_prediction JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Logs de auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Alianças (coligações/federações)
CREATE TABLE IF NOT EXISTS alliances (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'coalition',
  color TEXT NOT NULL DEFAULT '#003366',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Partidos em alianças
CREATE TABLE IF NOT EXISTS alliance_parties (
  id SERIAL PRIMARY KEY,
  alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE
);

-- ===========================================
-- TABELAS DE IMPORTAÇÃO TSE
-- ===========================================

-- Jobs de importação TSE
CREATE TABLE IF NOT EXISTS tse_import_jobs (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT DEFAULT 'pending',
  downloaded_bytes BIGINT DEFAULT 0,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  election_year INTEGER,
  election_type TEXT,
  uf TEXT,
  cargo_filter INTEGER,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- Votos de candidatos do TSE (50 campos do layout oficial)
CREATE TABLE IF NOT EXISTS tse_candidate_votes (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER REFERENCES tse_import_jobs(id) ON DELETE CASCADE,
  dt_geracao TEXT,
  hh_geracao TEXT,
  ano_eleicao INTEGER,
  cd_tipo_eleicao INTEGER,
  nm_tipo_eleicao TEXT,
  nr_turno INTEGER,
  cd_eleicao INTEGER,
  ds_eleicao TEXT,
  dt_eleicao TEXT,
  tp_abrangencia TEXT,
  sg_uf TEXT,
  sg_ue TEXT,
  nm_ue TEXT,
  cd_municipio INTEGER,
  nm_municipio TEXT,
  nr_zona INTEGER,
  cd_cargo INTEGER,
  ds_cargo TEXT,
  sq_candidato TEXT,
  nr_candidato INTEGER,
  nm_candidato TEXT,
  nm_urna_candidato TEXT,
  nm_social_candidato TEXT,
  cd_situacao_candidatura INTEGER,
  ds_situacao_candidatura TEXT,
  cd_detalhe_situacao_cand INTEGER,
  ds_detalhe_situacao_cand TEXT,
  cd_situacao_julgamento INTEGER,
  ds_situacao_julgamento TEXT,
  cd_situacao_cassacao INTEGER,
  ds_situacao_cassacao TEXT,
  cd_situacao_dconst_diploma INTEGER,
  ds_situacao_dconst_diploma TEXT,
  tp_agremiacao TEXT,
  nr_partido INTEGER,
  sg_partido TEXT,
  nm_partido TEXT,
  nr_federacao INTEGER,
  nm_federacao TEXT,
  sg_federacao TEXT,
  ds_composicao_federacao TEXT,
  sq_coligacao TEXT,
  nm_coligacao TEXT,
  ds_composicao_coligacao TEXT,
  st_voto_em_transito TEXT,
  qt_votos_nominais INTEGER,
  nm_tipo_destinacao_votos TEXT,
  qt_votos_nominais_validos INTEGER,
  cd_sit_tot_turno INTEGER,
  ds_sit_tot_turno TEXT
);

-- Erros de importação TSE
CREATE TABLE IF NOT EXISTS tse_import_errors (
  id SERIAL PRIMARY KEY,
  import_job_id INTEGER NOT NULL REFERENCES tse_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ===========================================
-- TABELAS DE RELATÓRIOS E ANÁLISE
-- ===========================================

-- Relatórios salvos
CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL,
  columns JSONB NOT NULL,
  chart_type TEXT DEFAULT 'bar',
  sort_by TEXT,
  sort_order TEXT DEFAULT 'desc',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- ===========================================
-- TABELAS DE BUSCA SEMÂNTICA
-- ===========================================

-- Documentos semânticos (para busca vetorial)
CREATE TABLE IF NOT EXISTS semantic_documents (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  year INTEGER,
  state TEXT,
  election_type TEXT,
  position TEXT,
  party_abbreviation TEXT,
  content TEXT NOT NULL,
  content_hash TEXT,
  metadata JSONB,
  embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS semantic_documents_year_idx ON semantic_documents(year);
CREATE INDEX IF NOT EXISTS semantic_documents_state_idx ON semantic_documents(state);
CREATE INDEX IF NOT EXISTS semantic_documents_party_idx ON semantic_documents(party_abbreviation);
CREATE INDEX IF NOT EXISTS semantic_documents_source_idx ON semantic_documents(source_type, source_id);

-- Histórico de buscas semânticas
CREATE TABLE IF NOT EXISTS semantic_search_queries (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  filters JSONB,
  result_count INTEGER DEFAULT 0,
  response_time INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

-- ===========================================
-- TABELAS DE IA E PREDIÇÕES
-- ===========================================

-- Cache de predições IA
CREATE TABLE IF NOT EXISTS ai_predictions (
  id SERIAL PRIMARY KEY,
  prediction_type TEXT NOT NULL,
  cache_key TEXT NOT NULL UNIQUE,
  filters JSONB,
  prediction JSONB NOT NULL,
  confidence DECIMAL(5, 4),
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ai_predictions_type_idx ON ai_predictions(prediction_type);
CREATE INDEX IF NOT EXISTS ai_predictions_cache_key_idx ON ai_predictions(cache_key);
CREATE INDEX IF NOT EXISTS ai_predictions_valid_until_idx ON ai_predictions(valid_until);

-- Dados de sentimento IA
CREATE TABLE IF NOT EXISTS ai_sentiment_data (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_url TEXT,
  title TEXT,
  content TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMP,
  party TEXT,
  state TEXT,
  sentiment TEXT,
  sentiment_score DECIMAL(5, 4),
  topics JSONB,
  analyzed BOOLEAN DEFAULT false,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_sentiment_source_type_idx ON ai_sentiment_data(source_type);
CREATE INDEX IF NOT EXISTS ai_sentiment_party_idx ON ai_sentiment_data(party);
CREATE INDEX IF NOT EXISTS ai_sentiment_published_at_idx ON ai_sentiment_data(published_at);

-- Relatórios de projeção
CREATE TABLE IF NOT EXISTS projection_reports (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_year INTEGER NOT NULL,
  election_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT,
  executive_summary TEXT,
  methodology TEXT,
  data_quality JSONB,
  turnout_projection JSONB,
  party_projections JSONB,
  candidate_projections JSONB,
  scenarios JSONB,
  risk_assessment JSONB,
  confidence_intervals JSONB,
  recommendations JSONB,
  version TEXT DEFAULT '1.0',
  valid_until TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS projection_reports_target_year_idx ON projection_reports(target_year);
CREATE INDEX IF NOT EXISTS projection_reports_scope_idx ON projection_reports(scope);
CREATE INDEX IF NOT EXISTS projection_reports_status_idx ON projection_reports(status);

-- ===========================================
-- TABELAS DE VALIDAÇÃO DE IMPORTAÇÃO
-- ===========================================

-- Execuções de validação
CREATE TABLE IF NOT EXISTS import_validation_runs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES tse_import_jobs(id),
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_records_checked INTEGER DEFAULT 0,
  issues_found INTEGER DEFAULT 0,
  summary JSONB,
  ai_analysis JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_runs_job_idx ON import_validation_runs(job_id);
CREATE INDEX IF NOT EXISTS validation_runs_status_idx ON import_validation_runs(status);

-- Issues de validação
CREATE TABLE IF NOT EXISTS import_validation_issues (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES import_validation_runs(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  category TEXT NOT NULL DEFAULT 'data_quality',
  row_reference TEXT,
  field TEXT,
  current_value TEXT,
  message TEXT NOT NULL,
  suggested_fix JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by VARCHAR REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_issues_run_idx ON import_validation_issues(run_id);
CREATE INDEX IF NOT EXISTS validation_issues_type_idx ON import_validation_issues(type);
CREATE INDEX IF NOT EXISTS validation_issues_severity_idx ON import_validation_issues(severity);
CREATE INDEX IF NOT EXISTS validation_issues_status_idx ON import_validation_issues(status);

-- ===========================================
-- TABELAS DE PREVISÕES ELEITORAIS
-- ===========================================

-- Execuções de previsão
CREATE TABLE IF NOT EXISTS forecast_runs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_year INTEGER NOT NULL,
  target_election_type TEXT,
  target_position TEXT,
  target_state TEXT,
  historical_years_used JSONB DEFAULT '[]',
  model_parameters JSONB,
  sentiment_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_simulations INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by VARCHAR REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS forecast_runs_target_year_idx ON forecast_runs(target_year);
CREATE INDEX IF NOT EXISTS forecast_runs_status_idx ON forecast_runs(status);
CREATE INDEX IF NOT EXISTS forecast_runs_created_at_idx ON forecast_runs(created_at);

-- Resultados de previsão
CREATE TABLE IF NOT EXISTS forecast_results (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL,
  entity_id INTEGER,
  entity_name TEXT NOT NULL,
  region TEXT,
  position TEXT,
  predicted_vote_share DECIMAL(7, 4),
  vote_share_lower DECIMAL(7, 4),
  vote_share_upper DECIMAL(7, 4),
  predicted_votes INTEGER,
  votes_lower INTEGER,
  votes_upper INTEGER,
  predicted_seats INTEGER,
  seats_lower INTEGER,
  seats_upper INTEGER,
  win_probability DECIMAL(5, 4),
  elected_probability DECIMAL(5, 4),
  historical_trend JSONB,
  trend_direction TEXT,
  trend_strength DECIMAL(5, 4),
  influence_factors JSONB,
  confidence DECIMAL(5, 4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS forecast_results_run_idx ON forecast_results(run_id);
CREATE INDEX IF NOT EXISTS forecast_results_type_idx ON forecast_results(result_type);
CREATE INDEX IF NOT EXISTS forecast_results_entity_idx ON forecast_results(entity_name);
CREATE INDEX IF NOT EXISTS forecast_results_region_idx ON forecast_results(region);

-- Regiões voláteis (swing regions)
CREATE TABLE IF NOT EXISTS forecast_swing_regions (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  region_name TEXT NOT NULL,
  position TEXT,
  margin_percent DECIMAL(5, 2),
  margin_votes INTEGER,
  volatility_score DECIMAL(5, 4),
  swing_magnitude DECIMAL(5, 2),
  leading_entity TEXT,
  challenging_entity TEXT,
  sentiment_balance DECIMAL(5, 4),
  recent_trend_shift DECIMAL(5, 4),
  outcome_uncertainty DECIMAL(5, 4),
  key_factors JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS swing_regions_run_idx ON forecast_swing_regions(run_id);
CREATE INDEX IF NOT EXISTS swing_regions_region_idx ON forecast_swing_regions(region);
CREATE INDEX IF NOT EXISTS swing_regions_volatility_idx ON forecast_swing_regions(volatility_score);

-- ===========================================
-- TABELA DE SESSÕES (para express-session)
-- ===========================================

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ===========================================
-- DADOS INICIAIS
-- ===========================================

-- Criar usuário admin padrão (senha: admin123)
INSERT INTO users (username, password, name, email, role, active)
VALUES (
  'admin',
  '$2a$10$K8pDJhVVV5fPgRK5D0YpTe.6BQYRf9d3VGTRlYIHV9KvF2zW4kNGe',
  'Administrador',
  'admin@simulavoto.gov.br',
  'admin',
  true
) ON CONFLICT (username) DO NOTHING;

-- Criar alguns partidos brasileiros básicos
INSERT INTO parties (name, abbreviation, number, color) VALUES
  ('Partido dos Trabalhadores', 'PT', 13, '#FF0000'),
  ('Partido Liberal', 'PL', 22, '#002B7F'),
  ('Partido Social Democrático', 'PSD', 55, '#FF8C00'),
  ('União Brasil', 'UNIÃO', 44, '#00008B'),
  ('Movimento Democrático Brasileiro', 'MDB', 15, '#008000'),
  ('Partido Progressistas', 'PP', 11, '#1E90FF'),
  ('Republicanos', 'REPUBLICANOS', 10, '#00CED1'),
  ('Partido Democrático Trabalhista', 'PDT', 12, '#FF4500'),
  ('Partido da Social Democracia Brasileira', 'PSDB', 45, '#0000CD'),
  ('Podemos', 'PODE', 20, '#800080')
ON CONFLICT (abbreviation) DO NOTHING;

-- ===========================================
-- FIM DO SCRIPT
-- ===========================================

SELECT 'SimulaVoto database initialized successfully!' AS status;
