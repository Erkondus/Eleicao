-- SimulaVoto - Script de Correção de Colunas (Janeiro 2026)
-- Execute este script no Supabase SQL Editor para corrigir colunas faltantes
-- Este script adiciona colunas que não existem sem afetar dados existentes

-- ===========================================
-- CORREÇÕES DA TABELA in_app_notifications
-- ===========================================

-- Adicionar coluna severity se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'severity') THEN
    ALTER TABLE in_app_notifications ADD COLUMN severity TEXT DEFAULT 'info';
  END IF;
END $$;

-- Adicionar coluna type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'type') THEN
    ALTER TABLE in_app_notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'system';
  END IF;
END $$;

-- Adicionar coluna related_entity_type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'related_entity_type') THEN
    ALTER TABLE in_app_notifications ADD COLUMN related_entity_type TEXT;
  END IF;
END $$;

-- Adicionar coluna related_entity_id se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'related_entity_id') THEN
    ALTER TABLE in_app_notifications ADD COLUMN related_entity_id TEXT;
  END IF;
END $$;

-- Adicionar coluna metadata se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'metadata') THEN
    ALTER TABLE in_app_notifications ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Adicionar coluna is_read se não existir (pode ter sido criada como 'read')
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'in_app_notifications' AND column_name = 'is_read') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'in_app_notifications' AND column_name = 'read') THEN
      ALTER TABLE in_app_notifications RENAME COLUMN "read" TO is_read;
    ELSE
      ALTER TABLE in_app_notifications ADD COLUMN is_read BOOLEAN DEFAULT false;
    END IF;
  END IF;
END $$;

-- ===========================================
-- CORREÇÕES DA TABELA ibge_municipios
-- ===========================================

-- Adicionar coluna uf_nome se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_municipios' AND column_name = 'uf_nome') THEN
    ALTER TABLE ibge_municipios ADD COLUMN uf_nome TEXT;
  END IF;
END $$;

-- Adicionar coluna regiao_nome se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_municipios' AND column_name = 'regiao_nome') THEN
    ALTER TABLE ibge_municipios ADD COLUMN regiao_nome TEXT;
  END IF;
END $$;

-- Remover colunas obsoletas se existirem
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' AND column_name = 'regiao') THEN
    ALTER TABLE ibge_municipios DROP COLUMN regiao;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' AND column_name = 'codigo_uf') THEN
    ALTER TABLE ibge_municipios DROP COLUMN codigo_uf;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' AND column_name = 'latitude') THEN
    ALTER TABLE ibge_municipios DROP COLUMN latitude;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' AND column_name = 'longitude') THEN
    ALTER TABLE ibge_municipios DROP COLUMN longitude;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' AND column_name = 'capital') THEN
    ALTER TABLE ibge_municipios DROP COLUMN capital;
  END IF;
END $$;

-- Converter codigo_ibge para VARCHAR(7) se for INTEGER
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' 
             AND column_name = 'codigo_ibge' 
             AND data_type = 'integer') THEN
    ALTER TABLE ibge_municipios ALTER COLUMN codigo_ibge TYPE VARCHAR(7) USING codigo_ibge::VARCHAR(7);
  END IF;
END $$;

-- ===========================================
-- CORREÇÕES DA TABELA ibge_import_jobs
-- ===========================================

-- Renomear job_type para type se existir job_type
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_import_jobs' AND column_name = 'job_type') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ibge_import_jobs' AND column_name = 'type') THEN
      ALTER TABLE ibge_import_jobs RENAME COLUMN job_type TO type;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'ibge_import_jobs' AND column_name = 'type') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN type TEXT NOT NULL DEFAULT 'all';
  END IF;
END $$;

-- Renomear total_items para total_records
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_import_jobs' AND column_name = 'total_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ibge_import_jobs' AND column_name = 'total_records') THEN
      ALTER TABLE ibge_import_jobs RENAME COLUMN total_items TO total_records;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'ibge_import_jobs' AND column_name = 'total_records') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN total_records INTEGER DEFAULT 0;
  END IF;
END $$;

-- Renomear processed_items para processed_records
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_import_jobs' AND column_name = 'processed_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ibge_import_jobs' AND column_name = 'processed_records') THEN
      ALTER TABLE ibge_import_jobs RENAME COLUMN processed_items TO processed_records;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'ibge_import_jobs' AND column_name = 'processed_records') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN processed_records INTEGER DEFAULT 0;
  END IF;
END $$;

-- Renomear failed_items para failed_records
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_import_jobs' AND column_name = 'failed_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ibge_import_jobs' AND column_name = 'failed_records') THEN
      ALTER TABLE ibge_import_jobs RENAME COLUMN failed_items TO failed_records;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'ibge_import_jobs' AND column_name = 'failed_records') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN failed_records INTEGER DEFAULT 0;
  END IF;
END $$;

-- Adicionar coluna error_details se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_import_jobs' AND column_name = 'error_details') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN error_details JSONB;
  END IF;
END $$;

-- Adicionar coluna source se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_import_jobs' AND column_name = 'source') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN source TEXT DEFAULT 'IBGE/SIDRA';
  END IF;
END $$;

-- Adicionar coluna parameters se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_import_jobs' AND column_name = 'parameters') THEN
    ALTER TABLE ibge_import_jobs ADD COLUMN parameters JSONB;
  END IF;
END $$;

-- ===========================================
-- CORREÇÕES DA TABELA ibge_populacao
-- ===========================================

-- Renomear populacao_total para populacao
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' AND column_name = 'populacao_total') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ibge_populacao' AND column_name = 'populacao') THEN
      ALTER TABLE ibge_populacao RENAME COLUMN populacao_total TO populacao;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'ibge_populacao' AND column_name = 'populacao') THEN
    ALTER TABLE ibge_populacao ADD COLUMN populacao BIGINT;
  END IF;
END $$;

-- Renomear codigo_ibge de INTEGER para VARCHAR se necessário
-- Primeiro verificar se já é VARCHAR
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' 
             AND column_name = 'codigo_ibge' 
             AND data_type = 'integer') THEN
    ALTER TABLE ibge_populacao ALTER COLUMN codigo_ibge TYPE VARCHAR(7) USING codigo_ibge::VARCHAR(7);
  END IF;
END $$;

-- Adicionar fonte se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_populacao' AND column_name = 'fonte') THEN
    ALTER TABLE ibge_populacao ADD COLUMN fonte TEXT DEFAULT 'IBGE/SIDRA';
  END IF;
END $$;

-- Adicionar tabela_sidra se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ibge_populacao' AND column_name = 'tabela_sidra') THEN
    ALTER TABLE ibge_populacao ADD COLUMN tabela_sidra VARCHAR(10);
  END IF;
END $$;

-- Remover colunas obsoletas se existirem
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' AND column_name = 'populacao_urbana') THEN
    ALTER TABLE ibge_populacao DROP COLUMN populacao_urbana;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' AND column_name = 'populacao_rural') THEN
    ALTER TABLE ibge_populacao DROP COLUMN populacao_rural;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' AND column_name = 'taxa_crescimento') THEN
    ALTER TABLE ibge_populacao DROP COLUMN taxa_crescimento;
  END IF;
END $$;

-- ===========================================
-- CORREÇÕES DA TABELA sentiment_crisis_alerts
-- ===========================================

-- Adicionar coluna alert_type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'alert_type') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN alert_type TEXT NOT NULL DEFAULT 'negative_spike';
  END IF;
END $$;

-- Adicionar coluna severity se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'severity') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'medium';
  END IF;
END $$;

-- Adicionar coluna title se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'title') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN title TEXT NOT NULL DEFAULT 'Alerta de Sentimento';
  END IF;
END $$;

-- Adicionar coluna description se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'description') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN description TEXT;
  END IF;
END $$;

-- Adicionar coluna sentiment_before se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'sentiment_before') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN sentiment_before DECIMAL(5, 4);
  END IF;
END $$;

-- Adicionar coluna sentiment_after se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'sentiment_after') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN sentiment_after DECIMAL(5, 4);
  END IF;
END $$;

-- Adicionar coluna mention_count se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'mention_count') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN mention_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Adicionar coluna trigger_article_ids se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'trigger_article_ids') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN trigger_article_ids JSONB DEFAULT '[]';
  END IF;
END $$;

-- Adicionar coluna trigger_keywords se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'trigger_keywords') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN trigger_keywords JSONB DEFAULT '[]';
  END IF;
END $$;

-- Renomear acknowledged para is_acknowledged se existir
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'acknowledged') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'is_acknowledged') THEN
      ALTER TABLE sentiment_crisis_alerts RENAME COLUMN acknowledged TO is_acknowledged;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'is_acknowledged') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN is_acknowledged BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Adicionar coluna detected_at se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_crisis_alerts' AND column_name = 'detected_at') THEN
    ALTER TABLE sentiment_crisis_alerts ADD COLUMN detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Converter entity_id para TEXT se for INTEGER
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'sentiment_crisis_alerts' 
             AND column_name = 'entity_id' 
             AND data_type = 'integer') THEN
    ALTER TABLE sentiment_crisis_alerts ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;
  END IF;
END $$;

-- ===========================================
-- CORREÇÕES DA TABELA sentiment_analysis_results
-- ===========================================

-- Adicionar coluna analysis_date se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'analysis_date') THEN
    -- Se tiver period_start/period_end, usar period_start como analysis_date
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sentiment_analysis_results' AND column_name = 'period_start') THEN
      ALTER TABLE sentiment_analysis_results ADD COLUMN analysis_date TIMESTAMP;
      UPDATE sentiment_analysis_results SET analysis_date = period_start WHERE analysis_date IS NULL;
      ALTER TABLE sentiment_analysis_results ALTER COLUMN analysis_date SET NOT NULL;
    ELSE
      ALTER TABLE sentiment_analysis_results ADD COLUMN analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
    END IF;
  END IF;
END $$;

-- Adicionar coluna sentiment_score se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'sentiment_score') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sentiment_analysis_results' AND column_name = 'average_score') THEN
      ALTER TABLE sentiment_analysis_results RENAME COLUMN average_score TO sentiment_score;
    ELSE
      ALTER TABLE sentiment_analysis_results ADD COLUMN sentiment_score DECIMAL(5, 4) DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Adicionar coluna sentiment_label se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'sentiment_label') THEN
    ALTER TABLE sentiment_analysis_results ADD COLUMN sentiment_label TEXT DEFAULT 'neutral';
  END IF;
END $$;

-- Adicionar coluna confidence se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'confidence') THEN
    ALTER TABLE sentiment_analysis_results ADD COLUMN confidence DECIMAL(5, 4) DEFAULT 0.8;
  END IF;
END $$;

-- Adicionar coluna mention_count se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'mention_count') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sentiment_analysis_results' AND column_name = 'total_articles') THEN
      ALTER TABLE sentiment_analysis_results RENAME COLUMN total_articles TO mention_count;
    ELSE
      ALTER TABLE sentiment_analysis_results ADD COLUMN mention_count INTEGER DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Adicionar coluna source_breakdown se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'source_breakdown') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sentiment_analysis_results' AND column_name = 'sources_breakdown') THEN
      ALTER TABLE sentiment_analysis_results RENAME COLUMN sources_breakdown TO source_breakdown;
    ELSE
      ALTER TABLE sentiment_analysis_results ADD COLUMN source_breakdown JSONB DEFAULT '{}';
    END IF;
  END IF;
END $$;

-- Adicionar coluna top_keywords se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'top_keywords') THEN
    ALTER TABLE sentiment_analysis_results ADD COLUMN top_keywords JSONB DEFAULT '[]';
  END IF;
END $$;

-- Adicionar coluna sample_mentions se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sentiment_analysis_results' AND column_name = 'sample_mentions') THEN
    ALTER TABLE sentiment_analysis_results ADD COLUMN sample_mentions JSONB DEFAULT '[]';
  END IF;
END $$;

-- Converter entity_id para TEXT se for INTEGER
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'sentiment_analysis_results' 
             AND column_name = 'entity_id' 
             AND data_type = 'integer') THEN
    ALTER TABLE sentiment_analysis_results ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;
  END IF;
END $$;

-- ===========================================
-- ÍNDICES FALTANTES
-- ===========================================

CREATE INDEX IF NOT EXISTS in_app_notifications_type_idx ON in_app_notifications(type);
CREATE INDEX IF NOT EXISTS in_app_notifications_severity_idx ON in_app_notifications(severity);
CREATE INDEX IF NOT EXISTS ibge_import_status_idx ON ibge_import_jobs(status);
CREATE INDEX IF NOT EXISTS ibge_import_type_idx ON ibge_import_jobs(type);
CREATE INDEX IF NOT EXISTS sentiment_entity_idx ON sentiment_analysis_results(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sentiment_date_idx ON sentiment_analysis_results(analysis_date);
CREATE INDEX IF NOT EXISTS crisis_alerts_type_idx ON sentiment_crisis_alerts(alert_type);

-- ===========================================
-- FIM DO SCRIPT DE CORREÇÃO
-- ===========================================

SELECT 'Column fixes applied successfully!' AS status;
