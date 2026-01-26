-- =====================================================
-- SimulaVoto - Migration para adicionar colunas TSE faltantes
-- Data: 2026-01-26
-- Descrição: Adiciona colunas que existem no schema mas não no banco de produção
-- =====================================================

-- =====================================================
-- 1. COLUNAS FALTANTES em tse_electoral_statistics
-- =====================================================

-- cd_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_tipo_eleicao') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN cd_tipo_eleicao integer;
    END IF;
END $$;

-- nm_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nm_tipo_eleicao') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN nm_tipo_eleicao text;
    END IF;
END $$;

-- cd_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_eleicao') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN cd_eleicao integer;
    END IF;
END $$;

-- ds_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'ds_eleicao') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN ds_eleicao text;
    END IF;
END $$;

-- dt_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'dt_eleicao') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN dt_eleicao text;
    END IF;
END $$;

-- tp_abrangencia
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'tp_abrangencia') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN tp_abrangencia text;
    END IF;
END $$;

-- sg_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'sg_ue') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN sg_ue text;
    END IF;
END $$;

-- nm_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nm_ue') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN nm_ue text;
    END IF;
END $$;

-- st_voto_em_transito
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'st_voto_em_transito') THEN
        ALTER TABLE tse_electoral_statistics ADD COLUMN st_voto_em_transito text;
    END IF;
END $$;

-- =====================================================
-- 2. COLUNAS FALTANTES em tse_candidate_votes
-- =====================================================

-- cd_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_tipo_eleicao') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN cd_tipo_eleicao integer;
    END IF;
END $$;

-- nm_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_tipo_eleicao') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN nm_tipo_eleicao text;
    END IF;
END $$;

-- cd_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_eleicao') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN cd_eleicao integer;
    END IF;
END $$;

-- ds_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_eleicao') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN ds_eleicao text;
    END IF;
END $$;

-- dt_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'dt_eleicao') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN dt_eleicao text;
    END IF;
END $$;

-- tp_abrangencia
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'tp_abrangencia') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN tp_abrangencia text;
    END IF;
END $$;

-- sg_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sg_ue') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN sg_ue text;
    END IF;
END $$;

-- nm_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_ue') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN nm_ue text;
    END IF;
END $$;

-- st_voto_em_transito
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'st_voto_em_transito') THEN
        ALTER TABLE tse_candidate_votes ADD COLUMN st_voto_em_transito text;
    END IF;
END $$;

-- =====================================================
-- 3. COLUNAS FALTANTES em tse_party_votes
-- =====================================================

-- cd_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_tipo_eleicao') THEN
        ALTER TABLE tse_party_votes ADD COLUMN cd_tipo_eleicao integer;
    END IF;
END $$;

-- nm_tipo_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_tipo_eleicao') THEN
        ALTER TABLE tse_party_votes ADD COLUMN nm_tipo_eleicao text;
    END IF;
END $$;

-- cd_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_eleicao') THEN
        ALTER TABLE tse_party_votes ADD COLUMN cd_eleicao integer;
    END IF;
END $$;

-- ds_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ds_eleicao') THEN
        ALTER TABLE tse_party_votes ADD COLUMN ds_eleicao text;
    END IF;
END $$;

-- dt_eleicao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'dt_eleicao') THEN
        ALTER TABLE tse_party_votes ADD COLUMN dt_eleicao text;
    END IF;
END $$;

-- tp_abrangencia
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'tp_abrangencia') THEN
        ALTER TABLE tse_party_votes ADD COLUMN tp_abrangencia text;
    END IF;
END $$;

-- sg_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sg_ue') THEN
        ALTER TABLE tse_party_votes ADD COLUMN sg_ue text;
    END IF;
END $$;

-- nm_ue
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_ue') THEN
        ALTER TABLE tse_party_votes ADD COLUMN nm_ue text;
    END IF;
END $$;

-- st_voto_em_transito
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'st_voto_em_transito') THEN
        ALTER TABLE tse_party_votes ADD COLUMN st_voto_em_transito text;
    END IF;
END $$;

-- =====================================================
-- 4. VERIFICAÇÃO FINAL
-- =====================================================

SELECT 'Colunas adicionadas com sucesso!' as status;

SELECT '=== tse_electoral_statistics ===' as tabela;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tse_electoral_statistics' 
ORDER BY ordinal_position;

SELECT '=== tse_candidate_votes ===' as tabela;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tse_candidate_votes' 
ORDER BY ordinal_position;

SELECT '=== tse_party_votes ===' as tabela;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tse_party_votes' 
ORDER BY ordinal_position;
