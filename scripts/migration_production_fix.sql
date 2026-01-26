-- =====================================================
-- SimulaVoto - Migration FIX para Produção
-- Data: 2026-01-26
-- Descrição: Remove colunas antigas e adiciona novas com nomes corretos
-- ATENÇÃO: Este script vai APAGAR dados de batches existentes!
-- =====================================================

-- =====================================================
-- 1. LIMPAR TABELAS DE BATCH (para evitar conflitos)
-- =====================================================
TRUNCATE TABLE tse_import_batch_rows CASCADE;
TRUNCATE TABLE tse_import_batches CASCADE;

-- =====================================================
-- 2. REMOVER COLUNAS ANTIGAS de tse_import_batches
-- =====================================================

-- Remover batch_number se existir
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS batch_number;

-- Remover start_row se existir
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS start_row;

-- Remover end_row se existir
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS end_row;

-- =====================================================
-- 3. ADICIONAR COLUNAS NOVAS de tse_import_batches
-- =====================================================

-- Adicionar batch_index
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'batch_index') THEN
        ALTER TABLE tse_import_batches ADD COLUMN batch_index integer NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Adicionar row_start
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_start') THEN
        ALTER TABLE tse_import_batches ADD COLUMN row_start integer NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Adicionar row_end
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_end') THEN
        ALTER TABLE tse_import_batches ADD COLUMN row_end integer NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Adicionar total_rows
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'total_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN total_rows integer NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Adicionar inserted_rows
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'inserted_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN inserted_rows integer DEFAULT 0;
    END IF;
END $$;

-- Adicionar skipped_rows
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'skipped_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN skipped_rows integer DEFAULT 0;
    END IF;
END $$;

-- Adicionar error_summary
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'error_summary') THEN
        ALTER TABLE tse_import_batches ADD COLUMN error_summary text;
    END IF;
END $$;

-- =====================================================
-- 4. COLUNAS FALTANTES em tse_import_batch_rows
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'error_type') THEN
        ALTER TABLE tse_import_batch_rows ADD COLUMN error_type text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'processed_at') THEN
        ALTER TABLE tse_import_batch_rows ADD COLUMN processed_at timestamp;
    END IF;
END $$;

-- =====================================================
-- 5. ÍNDICES ÚNICOS PARA TSE
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS tse_candidate_votes_unique_idx 
ON tse_candidate_votes (ano_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_candidato);

CREATE UNIQUE INDEX IF NOT EXISTS tse_electoral_stats_unique_idx 
ON tse_electoral_statistics (ano_eleicao, nr_turno, sg_uf, cd_municipio, cd_cargo);

CREATE UNIQUE INDEX IF NOT EXISTS tse_party_votes_unique_idx 
ON tse_party_votes (ano_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_partido);

-- =====================================================
-- 6. VERIFICAÇÃO FINAL
-- =====================================================

SELECT '=== ESTRUTURA FINAL tse_import_batches ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tse_import_batches'
ORDER BY ordinal_position;

SELECT '=== ESTRUTURA FINAL tse_import_batch_rows ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tse_import_batch_rows'
ORDER BY ordinal_position;

SELECT '=== ÍNDICES ÚNICOS ===' as info;
SELECT indexname, tablename
FROM pg_indexes 
WHERE indexname LIKE 'tse_%unique%'
ORDER BY tablename;
