-- =====================================================
-- SimulaVoto - Migration: Atualização para Produção
-- Data: 2026-01-26
-- Descrição: Adiciona colunas e índices faltantes no banco de produção
-- =====================================================

-- 1. Adicionar coluna batch_index na tabela tse_import_batches (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tse_import_batches' AND column_name = 'batch_index'
    ) THEN
        ALTER TABLE tse_import_batches ADD COLUMN batch_index integer NOT NULL DEFAULT 0;
        RAISE NOTICE 'Coluna batch_index adicionada em tse_import_batches';
    ELSE
        RAISE NOTICE 'Coluna batch_index já existe em tse_import_batches';
    END IF;
END $$;

-- 2. Índices únicos para TSE (para otimização de ON CONFLICT DO NOTHING)

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

-- Índice único para tse_electoral_statistics (SEM nr_zona - não existe nesta tabela)
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

-- 3. Verificar alterações
SELECT 'Colunas em tse_import_batches:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tse_import_batches'
ORDER BY ordinal_position;

SELECT 'Índices únicos TSE:' as info;
SELECT indexname, tablename
FROM pg_indexes 
WHERE indexname LIKE 'tse_%unique%'
ORDER BY tablename;
