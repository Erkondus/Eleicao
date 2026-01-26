-- =====================================================
-- SimulaVoto - Migration: Add Unique Indexes for TSE Tables
-- Data: 2026-01-26
-- Descrição: Cria índices únicos para otimizar ON CONFLICT DO NOTHING
-- =====================================================

-- Índice único para tse_candidate_votes (votos por candidato)
-- Chave: ano + turno + UF + município + zona + cargo + candidato
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

-- Índice único para tse_electoral_statistics (estatísticas eleitorais)
-- Chave: ano + turno + UF + município + cargo (SEM nr_zona - não existe nesta tabela)
CREATE UNIQUE INDEX IF NOT EXISTS tse_electoral_stats_unique_idx 
ON tse_electoral_statistics (
    ano_eleicao,
    nr_turno,
    sg_uf,
    cd_municipio,
    cd_cargo
);

-- Índice único para tse_party_votes (votos por partido)
-- Chave: ano + turno + UF + município + zona + cargo + partido
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

-- Verificar índices criados
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE indexname LIKE 'tse_%unique%'
ORDER BY tablename;
