-- =====================================================
-- SimulaVoto - Migration Completa para Produção
-- Data: 2026-01-26
-- Descrição: Sincroniza schema do banco de produção com o app
-- =====================================================

-- =====================================================
-- 1. TABELA tse_import_batches - Renomear colunas existentes
-- =====================================================

-- Renomear batch_number para batch_index (se batch_number existir e batch_index não)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'batch_number')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'batch_index') THEN
        ALTER TABLE tse_import_batches RENAME COLUMN batch_number TO batch_index;
        RAISE NOTICE 'Coluna batch_number renomeada para batch_index';
    END IF;
END $$;

-- Renomear start_row para row_start
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'start_row')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_start') THEN
        ALTER TABLE tse_import_batches RENAME COLUMN start_row TO row_start;
        RAISE NOTICE 'Coluna start_row renomeada para row_start';
    END IF;
END $$;

-- Renomear end_row para row_end
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'end_row')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_end') THEN
        ALTER TABLE tse_import_batches RENAME COLUMN end_row TO row_end;
        RAISE NOTICE 'Coluna end_row renomeada para row_end';
    END IF;
END $$;

-- Adicionar coluna total_rows (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'total_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN total_rows integer NOT NULL DEFAULT 0;
        RAISE NOTICE 'Coluna total_rows adicionada';
    END IF;
END $$;

-- Adicionar coluna inserted_rows (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'inserted_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN inserted_rows integer DEFAULT 0;
        RAISE NOTICE 'Coluna inserted_rows adicionada';
    END IF;
END $$;

-- Adicionar coluna skipped_rows (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'skipped_rows') THEN
        ALTER TABLE tse_import_batches ADD COLUMN skipped_rows integer DEFAULT 0;
        RAISE NOTICE 'Coluna skipped_rows adicionada';
    END IF;
END $$;

-- Adicionar coluna error_summary (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'error_summary') THEN
        ALTER TABLE tse_import_batches ADD COLUMN error_summary text;
        RAISE NOTICE 'Coluna error_summary adicionada';
    END IF;
END $$;

-- =====================================================
-- 2. TABELA tse_import_batch_rows - Adicionar colunas faltantes
-- =====================================================

-- Adicionar coluna error_type (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'error_type') THEN
        ALTER TABLE tse_import_batch_rows ADD COLUMN error_type text;
        RAISE NOTICE 'Coluna error_type adicionada em tse_import_batch_rows';
    END IF;
END $$;

-- Adicionar coluna processed_at (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'processed_at') THEN
        ALTER TABLE tse_import_batch_rows ADD COLUMN processed_at timestamp;
        RAISE NOTICE 'Coluna processed_at adicionada em tse_import_batch_rows';
    END IF;
END $$;

-- =====================================================
-- 3. ÍNDICES ÚNICOS PARA OTIMIZAÇÃO TSE
-- =====================================================

-- Índice único para tse_candidate_votes
CREATE UNIQUE INDEX IF NOT EXISTS tse_candidate_votes_unique_idx 
ON tse_candidate_votes (
    ano_eleicao,
    nr_turno,
    sg_uf,
    cd_municipio,
    nr_zona,
    cd_cargo,
    nr_candidato
);

-- Índice único para tse_electoral_statistics (SEM nr_zona)
CREATE UNIQUE INDEX IF NOT EXISTS tse_electoral_stats_unique_idx 
ON tse_electoral_statistics (
    ano_eleicao,
    nr_turno,
    sg_uf,
    cd_municipio,
    cd_cargo
);

-- Índice único para tse_party_votes
CREATE UNIQUE INDEX IF NOT EXISTS tse_party_votes_unique_idx 
ON tse_party_votes (
    ano_eleicao,
    nr_turno,
    sg_uf,
    cd_municipio,
    nr_zona,
    cd_cargo,
    nr_partido
);

-- =====================================================
-- 4. VERIFICAÇÃO FINAL
-- =====================================================

SELECT '=== COLUNAS tse_import_batches ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tse_import_batches'
ORDER BY ordinal_position;

SELECT '=== COLUNAS tse_import_batch_rows ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tse_import_batch_rows'
ORDER BY ordinal_position;

SELECT '=== ÍNDICES ÚNICOS TSE ===' as info;
SELECT indexname, tablename
FROM pg_indexes 
WHERE indexname LIKE 'tse_%unique%'
ORDER BY tablename;
