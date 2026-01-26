-- =====================================================
-- SimulaVoto - MIGRAÇÃO COMPLETA DEFINITIVA
-- Data: 2026-01-26
-- Descrição: Adiciona TODAS as colunas faltantes nas tabelas TSE
-- Execute este script no banco de produção antes de usar o sistema
-- =====================================================

-- =====================================================
-- PARTE 1: TABELA tse_candidate_votes (CANDIDATO)
-- =====================================================

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'import_job_id') THEN ALTER TABLE tse_candidate_votes ADD COLUMN import_job_id integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'dt_geracao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN dt_geracao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'hh_geracao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN hh_geracao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ano_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ano_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_tipo_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_tipo_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_tipo_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_tipo_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nr_turno') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nr_turno integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'dt_eleicao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN dt_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'tp_abrangencia') THEN ALTER TABLE tse_candidate_votes ADD COLUMN tp_abrangencia text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sg_uf') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sg_uf text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sg_ue') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sg_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_ue') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_municipio') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_municipio integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_municipio') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_municipio text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nr_zona') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nr_zona integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_cargo') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_cargo integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_cargo') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_cargo text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sq_candidato') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sq_candidato text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nr_candidato') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nr_candidato integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_candidato') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_candidato text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_urna_candidato') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_urna_candidato text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_social_candidato') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_social_candidato text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_situacao_candidatura') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_situacao_candidatura integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_situacao_candidatura') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_situacao_candidatura text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_detalhe_situacao_cand') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_detalhe_situacao_cand integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_detalhe_situacao_cand') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_detalhe_situacao_cand text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_situacao_julgamento') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_situacao_julgamento integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_situacao_julgamento') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_situacao_julgamento text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_situacao_cassacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_situacao_cassacao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_situacao_cassacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_situacao_cassacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_situacao_dconst_diploma') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_situacao_dconst_diploma integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_situacao_dconst_diploma') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_situacao_dconst_diploma text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'tp_agremiacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN tp_agremiacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nr_partido') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nr_partido integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sg_partido') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sg_partido text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_partido') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_partido text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nr_federacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nr_federacao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_federacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sg_federacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sg_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_composicao_federacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_composicao_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'sq_coligacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN sq_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_coligacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_composicao_coligacao') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_composicao_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'st_voto_em_transito') THEN ALTER TABLE tse_candidate_votes ADD COLUMN st_voto_em_transito text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'qt_votos_nominais') THEN ALTER TABLE tse_candidate_votes ADD COLUMN qt_votos_nominais integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'nm_tipo_destinacao_votos') THEN ALTER TABLE tse_candidate_votes ADD COLUMN nm_tipo_destinacao_votos text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'qt_votos_nominais_validos') THEN ALTER TABLE tse_candidate_votes ADD COLUMN qt_votos_nominais_validos integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'cd_sit_tot_turno') THEN ALTER TABLE tse_candidate_votes ADD COLUMN cd_sit_tot_turno integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_candidate_votes' AND column_name = 'ds_sit_tot_turno') THEN ALTER TABLE tse_candidate_votes ADD COLUMN ds_sit_tot_turno text; END IF; END $$;

-- =====================================================
-- PARTE 2: TABELA tse_electoral_statistics (DETALHE)
-- =====================================================

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'import_job_id') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN import_job_id integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'ano_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN ano_eleicao integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_tipo_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN cd_tipo_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nm_tipo_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN nm_tipo_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nr_turno') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN nr_turno integer NOT NULL DEFAULT 1; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN cd_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'ds_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN ds_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'dt_eleicao') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN dt_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'tp_abrangencia') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN tp_abrangencia text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'sg_uf') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN sg_uf text NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'sg_ue') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN sg_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nm_ue') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN nm_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_municipio') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN cd_municipio integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nm_municipio') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN nm_municipio text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'nr_zona') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN nr_zona integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'cd_cargo') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN cd_cargo integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'ds_cargo') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN ds_cargo text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_aptos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_aptos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_secoes_principais') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_secoes_principais integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_secoes_agregadas') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_secoes_agregadas integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_secoes_nao_instaladas') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_secoes_nao_instaladas integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_secoes') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_secoes integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_comparecimento') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_comparecimento integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_abstencoes') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_abstencoes integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'st_voto_em_transito') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN st_voto_em_transito text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_concorrentes') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_concorrentes integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_votos_validos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_votos_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nominais_validos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nominais_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_votos_leg_validos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_votos_leg_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_leg_validos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_leg_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nom_convr_leg_validos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nom_convr_leg_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_votos_anulados') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_votos_anulados integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nominais_anulados') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nominais_anulados integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_legenda_anulados') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_legenda_anulados integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_votos_anul_subjud') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_votos_anul_subjud integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nominais_anul_subjud') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nominais_anul_subjud integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_legenda_anul_subjud') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_legenda_anul_subjud integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_brancos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_brancos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_total_votos_nulos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_total_votos_nulos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nulos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nulos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_nulos_tecnicos') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_nulos_tecnicos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'qt_votos_anulados_apu_sep') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN qt_votos_anulados_apu_sep integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_electoral_statistics' AND column_name = 'created_at') THEN ALTER TABLE tse_electoral_statistics ADD COLUMN created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL; END IF; END $$;

-- =====================================================
-- PARTE 3: TABELA tse_party_votes (PARTIDO)
-- =====================================================

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'import_job_id') THEN ALTER TABLE tse_party_votes ADD COLUMN import_job_id integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ano_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN ano_eleicao integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_tipo_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN cd_tipo_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_tipo_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_tipo_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nr_turno') THEN ALTER TABLE tse_party_votes ADD COLUMN nr_turno integer NOT NULL DEFAULT 1; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN cd_eleicao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ds_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN ds_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'dt_eleicao') THEN ALTER TABLE tse_party_votes ADD COLUMN dt_eleicao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'tp_abrangencia') THEN ALTER TABLE tse_party_votes ADD COLUMN tp_abrangencia text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sg_uf') THEN ALTER TABLE tse_party_votes ADD COLUMN sg_uf text NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sg_ue') THEN ALTER TABLE tse_party_votes ADD COLUMN sg_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_ue') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_ue text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_municipio') THEN ALTER TABLE tse_party_votes ADD COLUMN cd_municipio integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_municipio') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_municipio text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nr_zona') THEN ALTER TABLE tse_party_votes ADD COLUMN nr_zona integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'cd_cargo') THEN ALTER TABLE tse_party_votes ADD COLUMN cd_cargo integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ds_cargo') THEN ALTER TABLE tse_party_votes ADD COLUMN ds_cargo text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'tp_agremiacao') THEN ALTER TABLE tse_party_votes ADD COLUMN tp_agremiacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nr_partido') THEN ALTER TABLE tse_party_votes ADD COLUMN nr_partido integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sg_partido') THEN ALTER TABLE tse_party_votes ADD COLUMN sg_partido text NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_partido') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_partido text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nr_federacao') THEN ALTER TABLE tse_party_votes ADD COLUMN nr_federacao integer; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_federacao') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sg_federacao') THEN ALTER TABLE tse_party_votes ADD COLUMN sg_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ds_composicao_federacao') THEN ALTER TABLE tse_party_votes ADD COLUMN ds_composicao_federacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'sq_coligacao') THEN ALTER TABLE tse_party_votes ADD COLUMN sq_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'nm_coligacao') THEN ALTER TABLE tse_party_votes ADD COLUMN nm_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'ds_composicao_coligacao') THEN ALTER TABLE tse_party_votes ADD COLUMN ds_composicao_coligacao text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'st_voto_em_transito') THEN ALTER TABLE tse_party_votes ADD COLUMN st_voto_em_transito text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_legenda_validos') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_legenda_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_nom_convr_leg_validos') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_nom_convr_leg_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_total_votos_leg_validos') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_total_votos_leg_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_nominais_validos') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_nominais_validos integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_legenda_anul_subjud') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_legenda_anul_subjud integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_nominais_anul_subjud') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_nominais_anul_subjud integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_legenda_anulados') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_legenda_anulados integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'qt_votos_nominais_anulados') THEN ALTER TABLE tse_party_votes ADD COLUMN qt_votos_nominais_anulados integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_party_votes' AND column_name = 'created_at') THEN ALTER TABLE tse_party_votes ADD COLUMN created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL; END IF; END $$;

-- =====================================================
-- PARTE 4: TABELAS DE IMPORT (BATCHES)
-- =====================================================

-- Limpar tabelas de batch para evitar conflitos
TRUNCATE TABLE tse_import_batch_rows CASCADE;
TRUNCATE TABLE tse_import_batches CASCADE;

-- Remover colunas antigas de tse_import_batches
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS batch_number;
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS start_row;
ALTER TABLE tse_import_batches DROP COLUMN IF EXISTS end_row;

-- Adicionar colunas novas
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'batch_index') THEN ALTER TABLE tse_import_batches ADD COLUMN batch_index integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_start') THEN ALTER TABLE tse_import_batches ADD COLUMN row_start integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'row_end') THEN ALTER TABLE tse_import_batches ADD COLUMN row_end integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'total_rows') THEN ALTER TABLE tse_import_batches ADD COLUMN total_rows integer NOT NULL DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'inserted_rows') THEN ALTER TABLE tse_import_batches ADD COLUMN inserted_rows integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'skipped_rows') THEN ALTER TABLE tse_import_batches ADD COLUMN skipped_rows integer DEFAULT 0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batches' AND column_name = 'error_summary') THEN ALTER TABLE tse_import_batches ADD COLUMN error_summary text; END IF; END $$;

-- Colunas faltantes em tse_import_batch_rows
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'error_type') THEN ALTER TABLE tse_import_batch_rows ADD COLUMN error_type text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tse_import_batch_rows' AND column_name = 'processed_at') THEN ALTER TABLE tse_import_batch_rows ADD COLUMN processed_at timestamp; END IF; END $$;

-- =====================================================
-- PARTE 5: ÍNDICES ÚNICOS COMPLETOS
-- IMPORTANTE: Inclui cd_eleicao para diferenciar eleições ordinárias de suplementares
-- E st_voto_em_transito para diferenciar votos normais de votos em trânsito
-- =====================================================

DROP INDEX IF EXISTS tse_candidate_votes_unique_idx;
DROP INDEX IF EXISTS tse_electoral_stats_unique_idx;
DROP INDEX IF EXISTS tse_party_votes_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS tse_candidate_votes_unique_idx 
ON tse_candidate_votes (ano_eleicao, cd_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_candidato, st_voto_em_transito);

CREATE UNIQUE INDEX IF NOT EXISTS tse_electoral_stats_unique_idx 
ON tse_electoral_statistics (ano_eleicao, cd_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, st_voto_em_transito);

CREATE UNIQUE INDEX IF NOT EXISTS tse_party_votes_unique_idx 
ON tse_party_votes (ano_eleicao, cd_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_partido, st_voto_em_transito);

-- Índices adicionais para performance
CREATE INDEX IF NOT EXISTS tse_electoral_stats_year_uf_cargo_idx ON tse_electoral_statistics (ano_eleicao, sg_uf, cd_cargo);
CREATE INDEX IF NOT EXISTS tse_electoral_stats_municipio_idx ON tse_electoral_statistics (cd_municipio);
CREATE INDEX IF NOT EXISTS tse_party_votes_year_uf_cargo_idx ON tse_party_votes (ano_eleicao, sg_uf, cd_cargo);
CREATE INDEX IF NOT EXISTS tse_party_votes_party_idx ON tse_party_votes (nr_partido);
CREATE INDEX IF NOT EXISTS tse_party_votes_municipio_idx ON tse_party_votes (cd_municipio);

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

SELECT 'MIGRAÇÃO COMPLETA!' as status;

SELECT '=== Colunas tse_electoral_statistics ===' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'tse_electoral_statistics' ORDER BY ordinal_position;

SELECT '=== Colunas tse_candidate_votes ===' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'tse_candidate_votes' ORDER BY ordinal_position;

SELECT '=== Colunas tse_party_votes ===' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'tse_party_votes' ORDER BY ordinal_position;

SELECT '=== Índices Únicos ===' as info;
SELECT indexname, tablename FROM pg_indexes 
WHERE indexname LIKE 'tse_%unique%' ORDER BY tablename;
