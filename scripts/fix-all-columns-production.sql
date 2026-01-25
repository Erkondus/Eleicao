-- =====================================================
-- Script de Correção Completo para Produção
-- SimulaVoto - Janeiro 2026 (Atualizado)
-- =====================================================
-- Execute este script no Supabase SQL Editor
-- ANTES de reiniciar o container Docker
-- =====================================================

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
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS email_body TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_status TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS last_run_error TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;

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

-- 6. IBGE_INDICADORES - Recriar com estrutura correta
DROP TABLE IF EXISTS ibge_indicadores CASCADE;

CREATE TABLE ibge_indicadores (
    id SERIAL PRIMARY KEY,
    municipio_id INTEGER REFERENCES ibge_municipios(id),
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
    -- Dados Eleitorais
    eleitores_aptos INTEGER,
    comparecimento_ultimo_pleito DECIMAL(6,3),
    abstencao_ultimo_pleito DECIMAL(6,3),
    -- Metadados
    fonte TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(codigo_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_ibge_indicadores_codigo ON ibge_indicadores(codigo_ibge);
CREATE INDEX IF NOT EXISTS idx_ibge_indicadores_municipio ON ibge_indicadores(municipio_id);
CREATE INDEX IF NOT EXISTS idx_ibge_indicadores_ano ON ibge_indicadores(ano);

-- 7. VERIFICAR RESULTADOS
SELECT 'Correções aplicadas com sucesso!' AS status;

-- Mostrar contagem de colunas por tabela
SELECT table_name, COUNT(*) as total_colunas
FROM information_schema.columns 
WHERE table_name IN ('parties', 'scenarios', 'report_schedules', 'ibge_indicadores', 'ibge_municipios', 'ibge_populacao')
GROUP BY table_name
ORDER BY table_name;
