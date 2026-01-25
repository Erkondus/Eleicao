-- =====================================================
-- Script de Correção Completo para Produção
-- SimulaVoto - Janeiro 2026 (Atualizado)
-- =====================================================
-- Execute este script no Supabase SQL Editor
-- ANTES de reiniciar o container Docker
-- =====================================================

-- 0. ÍNDICES DUPLICADOS - Remover índices idênticos
DROP INDEX IF EXISTS sentiment_results_entity_idx;
DROP INDEX IF EXISTS ibge_import_type_idx;
DROP INDEX IF EXISTS ibge_import_status_idx;

-- 1. PARTIES - Adicionar colunas faltantes
ALTER TABLE parties ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE parties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. SCENARIOS - Adicionar colunas históricas
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS historical_year INTEGER;
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS historical_uf TEXT;
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS historical_municipio TEXT;

-- 3. REPORT_SCHEDULES - Corrigir estrutura completa
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS time_of_day TEXT DEFAULT '08:00';
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS recipients JSONB DEFAULT '[]'::jsonb;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS email_body TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_status TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_error TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;

-- 3.1 REPORT_RUNS - Adicionar coluna recipients
ALTER TABLE report_runs ADD COLUMN IF NOT EXISTS recipients JSONB;

-- 4. IBGE_MUNICIPIOS - Corrigir tipo e adicionar colunas
ALTER TABLE ibge_municipios ADD COLUMN IF NOT EXISTS uf_nome TEXT;
ALTER TABLE ibge_municipios ADD COLUMN IF NOT EXISTS regiao_nome TEXT;
-- Converter codigo_ibge de INTEGER para VARCHAR(7) se necessário
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_municipios' 
             AND column_name = 'codigo_ibge' 
             AND data_type = 'integer') THEN
    ALTER TABLE ibge_municipios ALTER COLUMN codigo_ibge TYPE VARCHAR(7) USING codigo_ibge::VARCHAR(7);
  END IF;
END $$;

-- 5. IBGE_POPULACAO - Corrigir tipo
ALTER TABLE ibge_populacao ADD COLUMN IF NOT EXISTS tabela_sidra VARCHAR(10);
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'ibge_populacao' 
             AND column_name = 'codigo_ibge' 
             AND data_type = 'integer') THEN
    ALTER TABLE ibge_populacao ALTER COLUMN codigo_ibge TYPE VARCHAR(7) USING codigo_ibge::VARCHAR(7);
  END IF;
END $$;

-- 6. IBGE_INDICADORES - Recriar com estrutura EXATA do Drizzle Schema
-- IMPORTANTE: Colunas devem corresponder EXATAMENTE ao schema.ts
DROP TABLE IF EXISTS ibge_indicadores CASCADE;

CREATE TABLE ibge_indicadores (
    id SERIAL PRIMARY KEY,
    municipio_id INTEGER REFERENCES ibge_municipios(id) ON DELETE CASCADE,
    codigo_ibge VARCHAR(7) NOT NULL,
    ano INTEGER NOT NULL,
    -- Indicadores de Educação
    taxa_alfabetizacao DECIMAL(6,3),
    taxa_escolarizacao_6_14 DECIMAL(6,3),
    ideb DECIMAL(4,2),
    -- Indicadores Econômicos
    pib_per_capita DECIMAL(14,2),
    renda_media_domiciliar DECIMAL(12,2),
    salario_medio_mensal DECIMAL(10,2),
    taxa_desemprego DECIMAL(6,3),
    -- Indicadores Sociais (IDH)
    idhm DECIMAL(5,4),
    idhm_educacao DECIMAL(5,4),
    idhm_longevidade DECIMAL(5,4),
    idhm_renda DECIMAL(5,4),
    indice_gini DECIMAL(5,4),
    -- Infraestrutura
    percentual_urbanizacao DECIMAL(6,3),
    percentual_saneamento DECIMAL(6,3),
    percentual_agua_encanada DECIMAL(6,3),
    percentual_energia_eletrica DECIMAL(6,3),
    -- Dados Eleitorais (NOMES EXATOS DO SCHEMA)
    eleitores_aptos INTEGER,
    comparecimento INTEGER,
    abstencao INTEGER,
    votos_validos INTEGER,
    -- Metadados
    fonte TEXT DEFAULT 'IBGE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS indicadores_municipio_idx ON ibge_indicadores(municipio_id);
CREATE INDEX IF NOT EXISTS indicadores_ano_idx ON ibge_indicadores(ano);
CREATE INDEX IF NOT EXISTS indicadores_codigo_ano_idx ON ibge_indicadores(codigo_ibge, ano);

-- 7. VERIFICAR RESULTADOS
SELECT 'Correções aplicadas com sucesso!' AS status;

-- Mostrar estrutura da tabela ibge_indicadores para confirmar
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'ibge_indicadores'
ORDER BY ordinal_position;
