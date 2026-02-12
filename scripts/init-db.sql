-- SimulaVoto - Database Initialization Script for PostgreSQL (Docker Standalone)
-- Este script cria todas as tabelas necessarias para o sistema
-- Atualizado: Fevereiro 2026 - Versao completa com todas as tabelas
-- Requer extensao pgvector para busca semantica
-- Executado automaticamente pelo container PostgreSQL no primeiro deploy

-- ===========================================
-- EXTENSÕES
-- ===========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE TABLE activity_assignees (
    id integer NOT NULL,
    activity_id integer NOT NULL,
    team_member_id integer NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by character varying,
    completed_at timestamp without time zone,
    notes text
);
CREATE SEQUENCE activity_assignees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE activity_assignees_id_seq OWNED BY activity_assignees.id;
CREATE TABLE ai_kpi_goals (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    ai_session_id integer,
    kpi_name text NOT NULL,
    target_value numeric(15,4) NOT NULL,
    baseline_value numeric(15,4),
    predicted_value numeric(15,4),
    current_value numeric(15,4),
    unit text,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    tracking_window text DEFAULT 'weekly'::text,
    status text DEFAULT 'active'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    ai_recommendation text,
    ai_confidence numeric(5,2),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ai_kpi_goals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ai_kpi_goals_id_seq OWNED BY ai_kpi_goals.id;
CREATE TABLE ai_predictions (
    id integer NOT NULL,
    prediction_type text NOT NULL,
    cache_key text NOT NULL,
    filters jsonb,
    prediction jsonb NOT NULL,
    confidence numeric(5,4),
    valid_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE ai_predictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ai_predictions_id_seq OWNED BY ai_predictions.id;
CREATE TABLE ai_sentiment_data (
    id integer NOT NULL,
    source_type text NOT NULL,
    source_url text,
    title text,
    content text NOT NULL,
    author text,
    published_at timestamp without time zone,
    party text,
    state text,
    sentiment text,
    sentiment_score numeric(5,4),
    topics jsonb,
    analyzed boolean DEFAULT false,
    analyzed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ai_sentiment_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ai_sentiment_data_id_seq OWNED BY ai_sentiment_data.id;
CREATE TABLE ai_suggestions (
    id integer NOT NULL,
    user_id character varying,
    suggestion_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    relevance_score numeric(5,2) DEFAULT '0'::numeric,
    data_context jsonb DEFAULT '{}'::jsonb,
    dismissed boolean DEFAULT false,
    applied boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone
);
CREATE SEQUENCE ai_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ai_suggestions_id_seq OWNED BY ai_suggestions.id;
CREATE TABLE alert_configurations (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    is_global boolean DEFAULT false,
    entity_type text,
    entity_id text,
    sentiment_drop_threshold numeric(5,4) DEFAULT 0.3,
    critical_sentiment_level numeric(5,4) DEFAULT '-0.5'::numeric,
    mention_spike_multiplier numeric(5,2) DEFAULT 2.0,
    time_window_minutes integer DEFAULT 60,
    notify_email boolean DEFAULT true,
    notify_in_app boolean DEFAULT true,
    email_recipients jsonb DEFAULT '[]'::jsonb,
    min_alert_interval_minutes integer DEFAULT 30,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE alert_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE alert_configurations_id_seq OWNED BY alert_configurations.id;
CREATE TABLE alliance_parties (
    id integer NOT NULL,
    alliance_id integer NOT NULL,
    party_id integer NOT NULL
);
CREATE SEQUENCE alliance_parties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE alliance_parties_id_seq OWNED BY alliance_parties.id;
CREATE TABLE alliances (
    id integer NOT NULL,
    scenario_id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'coalition'::text NOT NULL,
    color text DEFAULT '#003366'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE alliances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE alliances_id_seq OWNED BY alliances.id;
CREATE TABLE article_entity_mentions (
    id integer NOT NULL,
    article_id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    entity_name text NOT NULL,
    mention_count integer DEFAULT 1,
    sentiment_score numeric(5,4),
    sentiment_label text,
    excerpts jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE article_entity_mentions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE article_entity_mentions_id_seq OWNED BY article_entity_mentions.id;
CREATE TABLE audit_logs (
    id integer NOT NULL,
    user_id character varying,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    details jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE audit_logs_id_seq OWNED BY audit_logs.id;
CREATE TABLE campaign_activities (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    scheduled_date timestamp without time zone,
    completed_date timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assigned_to text,
    budget_id integer,
    estimated_cost numeric(12,2),
    actual_cost numeric(12,2),
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_activities_id_seq OWNED BY campaign_activities.id;
CREATE TABLE campaign_budgets (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    category text NOT NULL,
    category_label text NOT NULL,
    allocated_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    spent_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_budgets_id_seq OWNED BY campaign_budgets.id;
CREATE TABLE campaign_impact_predictions (
    id integer NOT NULL,
    session_id integer NOT NULL,
    prediction_type text NOT NULL,
    investment_type text,
    investment_amount numeric(14,2),
    target_segments jsonb,
    duration integer,
    predicted_sentiment_change numeric(5,2),
    predicted_vote_intention numeric(5,2),
    predicted_vote_change numeric(5,2),
    confidence_interval jsonb,
    probability_of_success numeric(5,2),
    estimated_reach integer,
    cost_per_voter_reached numeric(10,2),
    expected_roi numeric(5,2),
    comparison_baseline jsonb,
    alternative_scenarios jsonb,
    ai_narrative text,
    risk_factors jsonb,
    recommendations jsonb,
    methodology text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_impact_predictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_impact_predictions_id_seq OWNED BY campaign_impact_predictions.id;
CREATE TABLE campaign_insight_reports (
    id integer NOT NULL,
    session_id integer NOT NULL,
    report_type text NOT NULL,
    title text NOT NULL,
    executive_summary text,
    full_content text,
    visualizations jsonb,
    key_insights jsonb,
    action_items jsonb,
    data_snapshot jsonb,
    generated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE campaign_insight_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_insight_reports_id_seq OWNED BY campaign_insight_reports.id;
CREATE TABLE campaign_insight_sessions (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    target_party_id integer,
    target_candidate_id integer,
    election_year integer NOT NULL,
    "position" text,
    target_region text,
    status text DEFAULT 'active'::text,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_insight_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_insight_sessions_id_seq OWNED BY campaign_insight_sessions.id;
CREATE TABLE campaign_metrics (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    metric_date timestamp without time zone NOT NULL,
    kpi_name text NOT NULL,
    kpi_value numeric(15,4) NOT NULL,
    target_value numeric(15,4),
    unit text,
    source text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_metrics_id_seq OWNED BY campaign_metrics.id;
CREATE TABLE campaign_notifications (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    type text NOT NULL,
    recipient_user_id character varying NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    severity text DEFAULT 'info'::text,
    related_activity_id integer,
    related_kpi_goal_id integer,
    scheduled_for timestamp without time zone,
    sent_at timestamp without time zone,
    in_app_notification_id integer,
    email_sent boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_notifications_id_seq OWNED BY campaign_notifications.id;
CREATE TABLE campaign_resources (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_cost numeric(12,2),
    total_cost numeric(12,2),
    status text DEFAULT 'available'::text NOT NULL,
    assigned_to text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_resources_id_seq OWNED BY campaign_resources.id;
CREATE TABLE campaign_team_members (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    user_id character varying NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    permissions text[] DEFAULT '{}'::text[],
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaign_team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaign_team_members_id_seq OWNED BY campaign_team_members.id;
CREATE TABLE campaigns (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    status text DEFAULT 'planning'::text NOT NULL,
    goal text,
    target_votes integer,
    target_region text,
    "position" text DEFAULT 'vereador'::text NOT NULL,
    total_budget numeric(15,2) DEFAULT '0'::numeric,
    spent_budget numeric(15,2) DEFAULT '0'::numeric,
    target_party_id integer,
    target_candidate_id integer,
    ai_session_id integer,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE campaigns_id_seq OWNED BY campaigns.id;
CREATE TABLE candidate_comparisons (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    candidate_ids jsonb NOT NULL,
    state text,
    "position" text,
    target_year integer NOT NULL,
    base_year integer,
    compare_metrics jsonb,
    include_historical boolean DEFAULT true,
    status text DEFAULT 'draft'::text NOT NULL,
    results jsonb,
    narrative text,
    ai_insights jsonb,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone
);
CREATE SEQUENCE candidate_comparisons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE candidate_comparisons_id_seq OWNED BY candidate_comparisons.id;
CREATE TABLE candidates (
    id integer NOT NULL,
    name text NOT NULL,
    nickname text,
    number integer NOT NULL,
    party_id integer NOT NULL,
    "position" text DEFAULT 'vereador'::text NOT NULL,
    biography text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying,
    notes text,
    tags text[],
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE candidates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE candidates_id_seq OWNED BY candidates.id;
CREATE TABLE conversations (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE conversations_id_seq OWNED BY conversations.id;
CREATE TABLE custom_dashboards (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    user_id character varying NOT NULL,
    is_public boolean DEFAULT false,
    layout jsonb DEFAULT '[]'::jsonb NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb,
    widgets jsonb DEFAULT '[]'::jsonb NOT NULL,
    theme text DEFAULT 'default'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE custom_dashboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE custom_dashboards_id_seq OWNED BY custom_dashboards.id;
CREATE TABLE event_impact_predictions (
    id integer NOT NULL,
    name text NOT NULL,
    event_description text NOT NULL,
    event_type text NOT NULL,
    event_date timestamp without time zone,
    affected_entities jsonb NOT NULL,
    state text,
    "position" text,
    target_year integer NOT NULL,
    estimated_impact_magnitude numeric(3,2),
    impact_duration text,
    impact_distribution jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    before_projection jsonb,
    after_projection jsonb,
    impact_delta jsonb,
    confidence_intervals jsonb,
    narrative text,
    ai_analysis jsonb,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone
);
CREATE SEQUENCE event_impact_predictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE event_impact_predictions_id_seq OWNED BY event_impact_predictions.id;
CREATE TABLE forecast_results (
    id integer NOT NULL,
    run_id integer NOT NULL,
    result_type text NOT NULL,
    entity_id integer,
    entity_name text NOT NULL,
    region text,
    "position" text,
    predicted_vote_share numeric(7,4),
    vote_share_lower numeric(7,4),
    vote_share_upper numeric(7,4),
    predicted_votes integer,
    votes_lower integer,
    votes_upper integer,
    predicted_seats integer,
    seats_lower integer,
    seats_upper integer,
    win_probability numeric(5,4),
    elected_probability numeric(5,4),
    historical_trend jsonb,
    trend_direction text,
    trend_strength numeric(5,4),
    influence_factors jsonb,
    confidence numeric(5,4),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE forecast_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE forecast_results_id_seq OWNED BY forecast_results.id;
CREATE TABLE forecast_runs (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    target_year integer NOT NULL,
    target_election_type text,
    target_position text,
    target_state text,
    historical_years_used jsonb DEFAULT '[]'::jsonb,
    model_parameters jsonb,
    sentiment_data jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    total_simulations integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE forecast_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE forecast_runs_id_seq OWNED BY forecast_runs.id;
CREATE TABLE forecast_swing_regions (
    id integer NOT NULL,
    run_id integer NOT NULL,
    region text NOT NULL,
    region_name text NOT NULL,
    "position" text,
    margin_percent numeric(5,2),
    margin_votes integer,
    volatility_score numeric(5,4),
    swing_magnitude numeric(5,2),
    leading_entity text,
    challenging_entity text,
    sentiment_balance numeric(5,4),
    recent_trend_shift numeric(5,4),
    outcome_uncertainty numeric(5,4),
    key_factors jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE forecast_swing_regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE forecast_swing_regions_id_seq OWNED BY forecast_swing_regions.id;
CREATE TABLE high_impact_segments (
    id integer NOT NULL,
    session_id integer NOT NULL,
    segment_type text NOT NULL,
    segment_name text NOT NULL,
    description text,
    uf text,
    municipios jsonb,
    region text,
    age_group text,
    education_level text,
    income_level text,
    estimated_voters integer,
    impact_score numeric(5,2),
    conversion_potential numeric(5,2),
    current_sentiment numeric(5,2),
    volatility numeric(5,2),
    priority_rank integer,
    ai_rationale text,
    key_factors jsonb,
    historical_trends jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE high_impact_segments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE high_impact_segments_id_seq OWNED BY high_impact_segments.id;
CREATE TABLE ibge_import_jobs (
    id integer NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    error_message text,
    error_details jsonb,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    source text DEFAULT 'IBGE/SIDRA'::text,
    parameters jsonb,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ibge_import_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ibge_import_jobs_id_seq OWNED BY ibge_import_jobs.id;
CREATE TABLE ibge_indicadores (
    id integer NOT NULL,
    municipio_id integer,
    codigo_ibge character varying(7) NOT NULL,
    ano integer NOT NULL,
    taxa_alfabetizacao numeric(6,3),
    taxa_escolarizacao_6_14 numeric(6,3),
    ideb numeric(4,2),
    pib_per_capita numeric(14,2),
    renda_media_domiciliar numeric(12,2),
    salario_medio_mensal numeric(10,2),
    taxa_desemprego numeric(6,3),
    idhm numeric(5,4),
    idhm_educacao numeric(5,4),
    idhm_longevidade numeric(5,4),
    idhm_renda numeric(5,4),
    indice_gini numeric(5,4),
    percentual_urbanizacao numeric(6,3),
    percentual_saneamento numeric(6,3),
    percentual_agua_encanada numeric(6,3),
    percentual_energia_eletrica numeric(6,3),
    eleitores_aptos integer,
    comparecimento integer,
    abstencao integer,
    votos_validos integer,
    fonte text DEFAULT 'IBGE'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ibge_indicadores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ibge_indicadores_id_seq OWNED BY ibge_indicadores.id;
CREATE TABLE ibge_municipios (
    id integer NOT NULL,
    codigo_ibge character varying(7) NOT NULL,
    nome text NOT NULL,
    uf character varying(2) NOT NULL,
    uf_nome text,
    regiao_nome text,
    mesorregiao text,
    microrregiao text,
    area_km2 numeric(12,3),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ibge_municipios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ibge_municipios_id_seq OWNED BY ibge_municipios.id;
CREATE TABLE ibge_populacao (
    id integer NOT NULL,
    municipio_id integer,
    codigo_ibge character varying(7) NOT NULL,
    ano integer NOT NULL,
    populacao bigint,
    populacao_masculina bigint,
    populacao_feminina bigint,
    densidade_demografica numeric(12,4),
    fonte text DEFAULT 'IBGE/SIDRA'::text,
    tabela_sidra character varying(10),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE ibge_populacao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE ibge_populacao_id_seq OWNED BY ibge_populacao.id;
CREATE TABLE import_validation_issues (
    id integer NOT NULL,
    run_id integer NOT NULL,
    type text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    category text DEFAULT 'data_quality'::text NOT NULL,
    row_reference text,
    field text,
    current_value text,
    message text NOT NULL,
    suggested_fix jsonb,
    status text DEFAULT 'open'::text NOT NULL,
    resolved_by character varying,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE import_validation_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE import_validation_issues_id_seq OWNED BY import_validation_issues.id;
CREATE TABLE import_validation_runs (
    id integer NOT NULL,
    job_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    total_records_checked integer DEFAULT 0,
    issues_found integer DEFAULT 0,
    summary jsonb,
    ai_analysis jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE import_validation_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE import_validation_runs_id_seq OWNED BY import_validation_runs.id;
CREATE TABLE in_app_notifications (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    type text NOT NULL,
    severity text DEFAULT 'info'::text,
    title text NOT NULL,
    message text NOT NULL,
    action_url text,
    related_entity_type text,
    related_entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE in_app_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE in_app_notifications_id_seq OWNED BY in_app_notifications.id;
CREATE TABLE message_strategies (
    id integer NOT NULL,
    session_id integer NOT NULL,
    segment_id integer,
    target_audience text NOT NULL,
    sentiment_profile text,
    main_theme text NOT NULL,
    key_messages jsonb,
    tone_recommendation text,
    channel_recommendations jsonb,
    topics_to_emphasize jsonb,
    topics_to_avoid jsonb,
    competitor_weaknesses jsonb,
    current_sentiment_trend text,
    sentiment_drivers jsonb,
    ai_analysis text,
    confidence_score numeric(5,2),
    expected_effectiveness numeric(5,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE message_strategies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE message_strategies_id_seq OWNED BY message_strategies.id;
CREATE TABLE messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE messages_id_seq OWNED BY messages.id;
CREATE TABLE parties (
    id integer NOT NULL,
    name text NOT NULL,
    abbreviation text NOT NULL,
    number integer NOT NULL,
    color text DEFAULT '#003366'::text NOT NULL,
    coalition text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying,
    notes text,
    tags text[],
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE SEQUENCE parties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE parties_id_seq OWNED BY parties.id;
CREATE TABLE prediction_scenarios (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    base_year integer NOT NULL,
    target_year integer NOT NULL,
    state text,
    "position" text,
    polling_data jsonb,
    polling_weight numeric(3,2) DEFAULT 0.30,
    party_adjustments jsonb,
    expected_turnout numeric(5,2),
    turnout_variation numeric(5,2) DEFAULT 5.00,
    external_factors jsonb,
    monte_carlo_iterations integer DEFAULT 10000,
    confidence_level numeric(3,2) DEFAULT 0.95,
    volatility_multiplier numeric(3,2) DEFAULT 1.20,
    status text DEFAULT 'draft'::text NOT NULL,
    results jsonb,
    narrative text,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone,
    parameters jsonb,
    forecast_run_id integer,
    last_run_at timestamp without time zone
);
CREATE SEQUENCE prediction_scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE prediction_scenarios_id_seq OWNED BY prediction_scenarios.id;
CREATE TABLE projection_reports (
    id integer NOT NULL,
    name text NOT NULL,
    target_year integer NOT NULL,
    election_type text NOT NULL,
    scope text NOT NULL,
    state text,
    executive_summary text,
    methodology text,
    data_quality jsonb,
    turnout_projection jsonb,
    party_projections jsonb,
    candidate_projections jsonb,
    scenarios jsonb,
    risk_assessment jsonb,
    confidence_intervals jsonb,
    recommendations jsonb,
    version text DEFAULT '1.0'::text,
    valid_until timestamp without time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying
);
CREATE SEQUENCE projection_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE projection_reports_id_seq OWNED BY projection_reports.id;
CREATE TABLE report_recipients (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    department text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE report_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE report_recipients_id_seq OWNED BY report_recipients.id;
CREATE TABLE report_runs (
    id integer NOT NULL,
    schedule_id integer,
    template_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    triggered_by text NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    row_count integer,
    file_size integer,
    file_path text,
    recipients jsonb,
    emails_sent integer DEFAULT 0,
    error_message text,
    execution_time_ms integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE report_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE report_runs_id_seq OWNED BY report_runs.id;
CREATE TABLE report_schedules (
    id integer NOT NULL,
    name text NOT NULL,
    template_id integer NOT NULL,
    frequency text NOT NULL,
    day_of_week integer,
    day_of_month integer,
    time_of_day text DEFAULT '08:00'::text NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    recipients jsonb NOT NULL,
    email_subject text,
    email_body text,
    last_run_at timestamp without time zone,
    next_run_at timestamp without time zone,
    last_run_status text,
    last_run_error text,
    is_active boolean DEFAULT true,
    run_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE report_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE report_schedules_id_seq OWNED BY report_schedules.id;
CREATE TABLE report_templates (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    report_type text NOT NULL,
    filters jsonb NOT NULL,
    columns jsonb NOT NULL,
    group_by text,
    sort_by text,
    sort_order text DEFAULT 'desc'::text,
    format text DEFAULT 'csv'::text NOT NULL,
    header_template text,
    footer_template text,
    include_charts boolean DEFAULT false,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE report_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE report_templates_id_seq OWNED BY report_templates.id;
CREATE TABLE saved_reports (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    filters jsonb NOT NULL,
    columns jsonb NOT NULL,
    chart_type text DEFAULT 'bar'::text,
    sort_by text,
    sort_order text DEFAULT 'desc'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE saved_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE saved_reports_id_seq OWNED BY saved_reports.id;
CREATE TABLE scenario_candidates (
    id integer NOT NULL,
    scenario_id integer NOT NULL,
    candidate_id integer NOT NULL,
    party_id integer NOT NULL,
    ballot_number integer NOT NULL,
    nickname text,
    status text DEFAULT 'active'::text NOT NULL,
    votes integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE scenario_candidates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE scenario_candidates_id_seq OWNED BY scenario_candidates.id;
CREATE TABLE scenario_simulations (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    simulation_type text NOT NULL,
    base_scenario jsonb NOT NULL,
    modified_scenario jsonb NOT NULL,
    parameters jsonb,
    scope jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    baseline_results jsonb,
    simulated_results jsonb,
    impact_analysis jsonb,
    narrative text,
    report_id integer,
    created_by character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp without time zone
);
CREATE SEQUENCE scenario_simulations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE scenario_simulations_id_seq OWNED BY scenario_simulations.id;
CREATE TABLE scenario_votes (
    id integer NOT NULL,
    scenario_id integer NOT NULL,
    party_id integer NOT NULL,
    candidate_id integer,
    votes integer DEFAULT 0 NOT NULL
);
CREATE SEQUENCE scenario_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE scenario_votes_id_seq OWNED BY scenario_votes.id;
CREATE TABLE scenarios (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    total_voters integer NOT NULL,
    valid_votes integer NOT NULL,
    available_seats integer NOT NULL,
    "position" text DEFAULT 'vereador'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying,
    historical_year integer,
    historical_uf text,
    historical_municipio text
);
CREATE SEQUENCE scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE scenarios_id_seq OWNED BY scenarios.id;
CREATE TABLE semantic_documents (
    id integer NOT NULL,
    source_type text NOT NULL,
    source_id integer,
    year integer,
    state text,
    election_type text,
    "position" text,
    party_abbreviation text,
    content text NOT NULL,
    content_hash text,
    metadata jsonb,
    embedding vector(1536),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE semantic_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE semantic_documents_id_seq OWNED BY semantic_documents.id;
CREATE TABLE semantic_search_queries (
    id integer NOT NULL,
    query text NOT NULL,
    filters jsonb,
    result_count integer DEFAULT 0,
    response_time integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE semantic_search_queries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE semantic_search_queries_id_seq OWNED BY semantic_search_queries.id;
CREATE TABLE sentiment_analysis_results (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    entity_name text NOT NULL,
    analysis_date timestamp without time zone NOT NULL,
    sentiment_score numeric(5,4) NOT NULL,
    sentiment_label text NOT NULL,
    confidence numeric(5,4) NOT NULL,
    mention_count integer DEFAULT 0,
    positive_count integer DEFAULT 0,
    negative_count integer DEFAULT 0,
    neutral_count integer DEFAULT 0,
    source_breakdown jsonb DEFAULT '{}'::jsonb,
    top_keywords jsonb DEFAULT '[]'::jsonb,
    sample_mentions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE sentiment_analysis_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_analysis_results_id_seq OWNED BY sentiment_analysis_results.id;
CREATE TABLE sentiment_articles (
    id integer NOT NULL,
    source_id integer,
    title text NOT NULL,
    content text NOT NULL,
    summary text,
    url text,
    author text,
    published_at timestamp without time zone,
    fetched_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    language text DEFAULT 'pt'::text,
    country text DEFAULT 'BR'::text,
    processed_at timestamp without time zone,
    source_type text DEFAULT 'news'::text,
    overall_sentiment numeric(5,4),
    sentiment_label text
);
CREATE SEQUENCE sentiment_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_articles_id_seq OWNED BY sentiment_articles.id;
CREATE TABLE sentiment_comparison_snapshots (
    id integer NOT NULL,
    session_id integer,
    snapshot_date timestamp without time zone NOT NULL,
    entity_results jsonb DEFAULT '[]'::jsonb NOT NULL,
    comparison_analysis text,
    overall_sentiment numeric(5,4),
    source_breakdown jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE sentiment_comparison_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_comparison_snapshots_id_seq OWNED BY sentiment_comparison_snapshots.id;
CREATE TABLE sentiment_crisis_alerts (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    entity_name text NOT NULL,
    alert_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    title text NOT NULL,
    description text,
    sentiment_before numeric(5,4),
    sentiment_after numeric(5,4),
    sentiment_change numeric(5,4),
    mention_count integer DEFAULT 0,
    trigger_article_ids jsonb DEFAULT '[]'::jsonb,
    trigger_keywords jsonb DEFAULT '[]'::jsonb,
    is_acknowledged boolean DEFAULT false,
    acknowledged_by character varying,
    acknowledged_at timestamp without time zone,
    detected_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE sentiment_crisis_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_crisis_alerts_id_seq OWNED BY sentiment_crisis_alerts.id;
CREATE TABLE sentiment_data_sources (
    id integer NOT NULL,
    source_type text NOT NULL,
    source_name text NOT NULL,
    source_url text,
    country text DEFAULT 'BR'::text,
    language text DEFAULT 'pt'::text,
    is_active boolean DEFAULT true,
    last_fetched timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE sentiment_data_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_data_sources_id_seq OWNED BY sentiment_data_sources.id;
CREATE TABLE sentiment_keywords (
    id integer NOT NULL,
    keyword text NOT NULL,
    entity_type text,
    entity_id text,
    frequency integer DEFAULT 1 NOT NULL,
    average_sentiment numeric(5,4) DEFAULT '0'::numeric,
    first_seen timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    trend_direction text DEFAULT 'stable'::text
);
CREATE SEQUENCE sentiment_keywords_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_keywords_id_seq OWNED BY sentiment_keywords.id;
CREATE TABLE sentiment_monitoring_sessions (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_filters jsonb DEFAULT '{}'::jsonb,
    date_range jsonb,
    alert_threshold numeric(5,4) DEFAULT '-0.3'::numeric,
    is_active boolean DEFAULT true,
    last_analyzed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE sentiment_monitoring_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sentiment_monitoring_sessions_id_seq OWNED BY sentiment_monitoring_sessions.id;
CREATE TABLE simulations (
    id integer NOT NULL,
    scenario_id integer NOT NULL,
    name text NOT NULL,
    electoral_quotient numeric(12,4),
    results jsonb,
    ai_prediction jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying
);
CREATE SEQUENCE simulations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE simulations_id_seq OWNED BY simulations.id;
CREATE TABLE tse_candidate_votes (
    id integer NOT NULL,
    import_job_id integer,
    dt_geracao text,
    hh_geracao text,
    ano_eleicao integer,
    cd_tipo_eleicao integer,
    nm_tipo_eleicao text,
    nr_turno integer,
    cd_eleicao integer,
    ds_eleicao text,
    dt_eleicao text,
    tp_abrangencia text,
    sg_uf text,
    sg_ue text,
    nm_ue text,
    cd_municipio integer,
    nm_municipio text,
    nr_zona integer,
    cd_cargo integer,
    ds_cargo text,
    sq_candidato text,
    nr_candidato integer,
    nm_candidato text,
    nm_urna_candidato text,
    nm_social_candidato text,
    cd_situacao_candidatura integer,
    ds_situacao_candidatura text,
    cd_detalhe_situacao_cand integer,
    ds_detalhe_situacao_cand text,
    cd_situacao_julgamento integer,
    ds_situacao_julgamento text,
    cd_situacao_cassacao integer,
    ds_situacao_cassacao text,
    cd_situacao_dconst_diploma integer,
    ds_situacao_dconst_diploma text,
    tp_agremiacao text,
    nr_partido integer,
    sg_partido text,
    nm_partido text,
    nr_federacao integer,
    nm_federacao text,
    sg_federacao text,
    ds_composicao_federacao text,
    sq_coligacao text,
    nm_coligacao text,
    ds_composicao_coligacao text,
    st_voto_em_transito text,
    qt_votos_nominais integer,
    nm_tipo_destinacao_votos text,
    qt_votos_nominais_validos integer,
    cd_sit_tot_turno integer,
    ds_sit_tot_turno text
);
CREATE SEQUENCE tse_candidate_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_candidate_votes_id_seq OWNED BY tse_candidate_votes.id;
CREATE TABLE tse_electoral_statistics (
    id integer NOT NULL,
    import_job_id integer,
    ano_eleicao integer NOT NULL,
    cd_tipo_eleicao integer,
    nm_tipo_eleicao text,
    nr_turno integer DEFAULT 1 NOT NULL,
    cd_eleicao integer,
    ds_eleicao text,
    dt_eleicao text,
    tp_abrangencia text,
    sg_uf text NOT NULL,
    sg_ue text,
    nm_ue text,
    cd_municipio integer,
    nm_municipio text,
    nr_zona integer,
    cd_cargo integer NOT NULL,
    ds_cargo text,
    qt_aptos integer DEFAULT 0,
    qt_secoes_principais integer DEFAULT 0,
    qt_secoes_agregadas integer DEFAULT 0,
    qt_secoes_nao_instaladas integer DEFAULT 0,
    qt_total_secoes integer DEFAULT 0,
    qt_comparecimento integer DEFAULT 0,
    qt_abstencoes integer DEFAULT 0,
    st_voto_em_transito text,
    qt_votos integer DEFAULT 0,
    qt_votos_concorrentes integer DEFAULT 0,
    qt_total_votos_validos integer DEFAULT 0,
    qt_votos_nominais_validos integer DEFAULT 0,
    qt_total_votos_leg_validos integer DEFAULT 0,
    qt_votos_leg_validos integer DEFAULT 0,
    qt_votos_nom_convr_leg_validos integer DEFAULT 0,
    qt_total_votos_anulados integer DEFAULT 0,
    qt_votos_nominais_anulados integer DEFAULT 0,
    qt_votos_legenda_anulados integer DEFAULT 0,
    qt_total_votos_anul_subjud integer DEFAULT 0,
    qt_votos_nominais_anul_subjud integer DEFAULT 0,
    qt_votos_legenda_anul_subjud integer DEFAULT 0,
    qt_votos_brancos integer DEFAULT 0,
    qt_total_votos_nulos integer DEFAULT 0,
    qt_votos_nulos integer DEFAULT 0,
    qt_votos_nulos_tecnicos integer DEFAULT 0,
    qt_votos_anulados_apu_sep integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE tse_electoral_statistics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_electoral_statistics_id_seq OWNED BY tse_electoral_statistics.id;
CREATE TABLE tse_import_batch_rows (
    id integer NOT NULL,
    batch_id integer NOT NULL,
    row_number integer NOT NULL,
    raw_data text NOT NULL,
    parsed_data jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    error_type text,
    error_message text,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE tse_import_batch_rows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_import_batch_rows_id_seq OWNED BY tse_import_batch_rows.id;
CREATE TABLE tse_import_batches (
    id integer NOT NULL,
    import_job_id integer NOT NULL,
    batch_index integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    row_start integer NOT NULL,
    row_end integer NOT NULL,
    total_rows integer NOT NULL,
    processed_rows integer DEFAULT 0,
    inserted_rows integer DEFAULT 0,
    skipped_rows integer DEFAULT 0,
    error_count integer DEFAULT 0,
    error_summary text,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE tse_import_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_import_batches_id_seq OWNED BY tse_import_batches.id;
CREATE TABLE tse_import_errors (
    id integer NOT NULL,
    import_job_id integer NOT NULL,
    row_number integer,
    error_type text NOT NULL,
    error_message text NOT NULL,
    raw_data text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE tse_import_errors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_import_errors_id_seq OWNED BY tse_import_errors.id;
CREATE TABLE tse_import_jobs (
    id integer NOT NULL,
    filename text NOT NULL,
    file_size bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    error_count integer DEFAULT 0,
    election_year integer,
    election_type text,
    uf text,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying,
    error_message text,
    cargo_filter integer,
    stage text DEFAULT 'pending'::text,
    downloaded_bytes bigint DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    skipped_rows integer DEFAULT 0,
    total_file_rows integer,
    validation_status text DEFAULT 'pending'::text,
    validation_message text,
    validated_at timestamp without time zone,
    source_url text
);
CREATE SEQUENCE tse_import_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_import_jobs_id_seq OWNED BY tse_import_jobs.id;
CREATE TABLE tse_party_votes (
    id integer NOT NULL,
    import_job_id integer,
    ano_eleicao integer NOT NULL,
    cd_tipo_eleicao integer,
    nm_tipo_eleicao text,
    nr_turno integer DEFAULT 1 NOT NULL,
    cd_eleicao integer,
    ds_eleicao text,
    dt_eleicao text,
    tp_abrangencia text,
    sg_uf text NOT NULL,
    sg_ue text,
    nm_ue text,
    cd_municipio integer,
    nm_municipio text,
    nr_zona integer,
    cd_cargo integer NOT NULL,
    ds_cargo text,
    tp_agremiacao text,
    nr_partido integer NOT NULL,
    sg_partido text NOT NULL,
    nm_partido text,
    nr_federacao integer,
    nm_federacao text,
    sg_federacao text,
    ds_composicao_federacao text,
    sq_coligacao text,
    nm_coligacao text,
    ds_composicao_coligacao text,
    st_voto_em_transito text,
    qt_votos_legenda_validos integer DEFAULT 0,
    qt_votos_nom_convr_leg_validos integer DEFAULT 0,
    qt_total_votos_leg_validos integer DEFAULT 0,
    qt_votos_nominais_validos integer DEFAULT 0,
    qt_votos_legenda_anul_subjud integer DEFAULT 0,
    qt_votos_nominais_anul_subjud integer DEFAULT 0,
    qt_votos_legenda_anulados integer DEFAULT 0,
    qt_votos_nominais_anulados integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE tse_party_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE tse_party_votes_id_seq OWNED BY tse_party_votes.id;
CREATE TABLE users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE ONLY activity_assignees ALTER COLUMN id SET DEFAULT nextval('activity_assignees_id_seq'::regclass);
ALTER TABLE ONLY ai_kpi_goals ALTER COLUMN id SET DEFAULT nextval('ai_kpi_goals_id_seq'::regclass);
ALTER TABLE ONLY ai_predictions ALTER COLUMN id SET DEFAULT nextval('ai_predictions_id_seq'::regclass);
ALTER TABLE ONLY ai_sentiment_data ALTER COLUMN id SET DEFAULT nextval('ai_sentiment_data_id_seq'::regclass);
ALTER TABLE ONLY ai_suggestions ALTER COLUMN id SET DEFAULT nextval('ai_suggestions_id_seq'::regclass);
ALTER TABLE ONLY alert_configurations ALTER COLUMN id SET DEFAULT nextval('alert_configurations_id_seq'::regclass);
ALTER TABLE ONLY alliance_parties ALTER COLUMN id SET DEFAULT nextval('alliance_parties_id_seq'::regclass);
ALTER TABLE ONLY alliances ALTER COLUMN id SET DEFAULT nextval('alliances_id_seq'::regclass);
ALTER TABLE ONLY article_entity_mentions ALTER COLUMN id SET DEFAULT nextval('article_entity_mentions_id_seq'::regclass);
ALTER TABLE ONLY audit_logs ALTER COLUMN id SET DEFAULT nextval('audit_logs_id_seq'::regclass);
ALTER TABLE ONLY campaign_activities ALTER COLUMN id SET DEFAULT nextval('campaign_activities_id_seq'::regclass);
ALTER TABLE ONLY campaign_budgets ALTER COLUMN id SET DEFAULT nextval('campaign_budgets_id_seq'::regclass);
ALTER TABLE ONLY campaign_impact_predictions ALTER COLUMN id SET DEFAULT nextval('campaign_impact_predictions_id_seq'::regclass);
ALTER TABLE ONLY campaign_insight_reports ALTER COLUMN id SET DEFAULT nextval('campaign_insight_reports_id_seq'::regclass);
ALTER TABLE ONLY campaign_insight_sessions ALTER COLUMN id SET DEFAULT nextval('campaign_insight_sessions_id_seq'::regclass);
ALTER TABLE ONLY campaign_metrics ALTER COLUMN id SET DEFAULT nextval('campaign_metrics_id_seq'::regclass);
ALTER TABLE ONLY campaign_notifications ALTER COLUMN id SET DEFAULT nextval('campaign_notifications_id_seq'::regclass);
ALTER TABLE ONLY campaign_resources ALTER COLUMN id SET DEFAULT nextval('campaign_resources_id_seq'::regclass);
ALTER TABLE ONLY campaign_team_members ALTER COLUMN id SET DEFAULT nextval('campaign_team_members_id_seq'::regclass);
ALTER TABLE ONLY campaigns ALTER COLUMN id SET DEFAULT nextval('campaigns_id_seq'::regclass);
ALTER TABLE ONLY candidate_comparisons ALTER COLUMN id SET DEFAULT nextval('candidate_comparisons_id_seq'::regclass);
ALTER TABLE ONLY candidates ALTER COLUMN id SET DEFAULT nextval('candidates_id_seq'::regclass);
ALTER TABLE ONLY conversations ALTER COLUMN id SET DEFAULT nextval('conversations_id_seq'::regclass);
ALTER TABLE ONLY custom_dashboards ALTER COLUMN id SET DEFAULT nextval('custom_dashboards_id_seq'::regclass);
ALTER TABLE ONLY event_impact_predictions ALTER COLUMN id SET DEFAULT nextval('event_impact_predictions_id_seq'::regclass);
ALTER TABLE ONLY forecast_results ALTER COLUMN id SET DEFAULT nextval('forecast_results_id_seq'::regclass);
ALTER TABLE ONLY forecast_runs ALTER COLUMN id SET DEFAULT nextval('forecast_runs_id_seq'::regclass);
ALTER TABLE ONLY forecast_swing_regions ALTER COLUMN id SET DEFAULT nextval('forecast_swing_regions_id_seq'::regclass);
ALTER TABLE ONLY high_impact_segments ALTER COLUMN id SET DEFAULT nextval('high_impact_segments_id_seq'::regclass);
ALTER TABLE ONLY ibge_import_jobs ALTER COLUMN id SET DEFAULT nextval('ibge_import_jobs_id_seq'::regclass);
ALTER TABLE ONLY ibge_indicadores ALTER COLUMN id SET DEFAULT nextval('ibge_indicadores_id_seq'::regclass);
ALTER TABLE ONLY ibge_municipios ALTER COLUMN id SET DEFAULT nextval('ibge_municipios_id_seq'::regclass);
ALTER TABLE ONLY ibge_populacao ALTER COLUMN id SET DEFAULT nextval('ibge_populacao_id_seq'::regclass);
ALTER TABLE ONLY import_validation_issues ALTER COLUMN id SET DEFAULT nextval('import_validation_issues_id_seq'::regclass);
ALTER TABLE ONLY import_validation_runs ALTER COLUMN id SET DEFAULT nextval('import_validation_runs_id_seq'::regclass);
ALTER TABLE ONLY in_app_notifications ALTER COLUMN id SET DEFAULT nextval('in_app_notifications_id_seq'::regclass);
ALTER TABLE ONLY message_strategies ALTER COLUMN id SET DEFAULT nextval('message_strategies_id_seq'::regclass);
ALTER TABLE ONLY messages ALTER COLUMN id SET DEFAULT nextval('messages_id_seq'::regclass);
ALTER TABLE ONLY parties ALTER COLUMN id SET DEFAULT nextval('parties_id_seq'::regclass);
ALTER TABLE ONLY prediction_scenarios ALTER COLUMN id SET DEFAULT nextval('prediction_scenarios_id_seq'::regclass);
ALTER TABLE ONLY projection_reports ALTER COLUMN id SET DEFAULT nextval('projection_reports_id_seq'::regclass);
ALTER TABLE ONLY report_recipients ALTER COLUMN id SET DEFAULT nextval('report_recipients_id_seq'::regclass);
ALTER TABLE ONLY report_runs ALTER COLUMN id SET DEFAULT nextval('report_runs_id_seq'::regclass);
ALTER TABLE ONLY report_schedules ALTER COLUMN id SET DEFAULT nextval('report_schedules_id_seq'::regclass);
ALTER TABLE ONLY report_templates ALTER COLUMN id SET DEFAULT nextval('report_templates_id_seq'::regclass);
ALTER TABLE ONLY saved_reports ALTER COLUMN id SET DEFAULT nextval('saved_reports_id_seq'::regclass);
ALTER TABLE ONLY scenario_candidates ALTER COLUMN id SET DEFAULT nextval('scenario_candidates_id_seq'::regclass);
ALTER TABLE ONLY scenario_simulations ALTER COLUMN id SET DEFAULT nextval('scenario_simulations_id_seq'::regclass);
ALTER TABLE ONLY scenario_votes ALTER COLUMN id SET DEFAULT nextval('scenario_votes_id_seq'::regclass);
ALTER TABLE ONLY scenarios ALTER COLUMN id SET DEFAULT nextval('scenarios_id_seq'::regclass);
ALTER TABLE ONLY semantic_documents ALTER COLUMN id SET DEFAULT nextval('semantic_documents_id_seq'::regclass);
ALTER TABLE ONLY semantic_search_queries ALTER COLUMN id SET DEFAULT nextval('semantic_search_queries_id_seq'::regclass);
ALTER TABLE ONLY sentiment_analysis_results ALTER COLUMN id SET DEFAULT nextval('sentiment_analysis_results_id_seq'::regclass);
ALTER TABLE ONLY sentiment_articles ALTER COLUMN id SET DEFAULT nextval('sentiment_articles_id_seq'::regclass);
ALTER TABLE ONLY sentiment_comparison_snapshots ALTER COLUMN id SET DEFAULT nextval('sentiment_comparison_snapshots_id_seq'::regclass);
ALTER TABLE ONLY sentiment_crisis_alerts ALTER COLUMN id SET DEFAULT nextval('sentiment_crisis_alerts_id_seq'::regclass);
ALTER TABLE ONLY sentiment_data_sources ALTER COLUMN id SET DEFAULT nextval('sentiment_data_sources_id_seq'::regclass);
ALTER TABLE ONLY sentiment_keywords ALTER COLUMN id SET DEFAULT nextval('sentiment_keywords_id_seq'::regclass);
ALTER TABLE ONLY sentiment_monitoring_sessions ALTER COLUMN id SET DEFAULT nextval('sentiment_monitoring_sessions_id_seq'::regclass);
ALTER TABLE ONLY simulations ALTER COLUMN id SET DEFAULT nextval('simulations_id_seq'::regclass);
ALTER TABLE ONLY tse_candidate_votes ALTER COLUMN id SET DEFAULT nextval('tse_candidate_votes_id_seq'::regclass);
ALTER TABLE ONLY tse_electoral_statistics ALTER COLUMN id SET DEFAULT nextval('tse_electoral_statistics_id_seq'::regclass);
ALTER TABLE ONLY tse_import_batch_rows ALTER COLUMN id SET DEFAULT nextval('tse_import_batch_rows_id_seq'::regclass);
ALTER TABLE ONLY tse_import_batches ALTER COLUMN id SET DEFAULT nextval('tse_import_batches_id_seq'::regclass);
ALTER TABLE ONLY tse_import_errors ALTER COLUMN id SET DEFAULT nextval('tse_import_errors_id_seq'::regclass);
ALTER TABLE ONLY tse_import_jobs ALTER COLUMN id SET DEFAULT nextval('tse_import_jobs_id_seq'::regclass);
ALTER TABLE ONLY tse_party_votes ALTER COLUMN id SET DEFAULT nextval('tse_party_votes_id_seq'::regclass);
ALTER TABLE ONLY activity_assignees
    ADD CONSTRAINT activity_assignees_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ai_kpi_goals
    ADD CONSTRAINT ai_kpi_goals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ai_predictions
    ADD CONSTRAINT ai_predictions_cache_key_unique UNIQUE (cache_key);
ALTER TABLE ONLY ai_predictions
    ADD CONSTRAINT ai_predictions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ai_sentiment_data
    ADD CONSTRAINT ai_sentiment_data_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ai_suggestions
    ADD CONSTRAINT ai_suggestions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY alert_configurations
    ADD CONSTRAINT alert_configurations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY alliance_parties
    ADD CONSTRAINT alliance_parties_pkey PRIMARY KEY (id);
ALTER TABLE ONLY alliances
    ADD CONSTRAINT alliances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY article_entity_mentions
    ADD CONSTRAINT article_entity_mentions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_activities
    ADD CONSTRAINT campaign_activities_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_budgets
    ADD CONSTRAINT campaign_budgets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_impact_predictions
    ADD CONSTRAINT campaign_impact_predictions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_insight_reports
    ADD CONSTRAINT campaign_insight_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_insight_sessions
    ADD CONSTRAINT campaign_insight_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_metrics
    ADD CONSTRAINT campaign_metrics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_resources
    ADD CONSTRAINT campaign_resources_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaign_team_members
    ADD CONSTRAINT campaign_team_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY candidate_comparisons
    ADD CONSTRAINT candidate_comparisons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY custom_dashboards
    ADD CONSTRAINT custom_dashboards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY event_impact_predictions
    ADD CONSTRAINT event_impact_predictions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY forecast_results
    ADD CONSTRAINT forecast_results_pkey PRIMARY KEY (id);
ALTER TABLE ONLY forecast_runs
    ADD CONSTRAINT forecast_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY forecast_swing_regions
    ADD CONSTRAINT forecast_swing_regions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY high_impact_segments
    ADD CONSTRAINT high_impact_segments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ibge_import_jobs
    ADD CONSTRAINT ibge_import_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ibge_indicadores
    ADD CONSTRAINT ibge_indicadores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ibge_municipios
    ADD CONSTRAINT ibge_municipios_codigo_ibge_unique UNIQUE (codigo_ibge);
ALTER TABLE ONLY ibge_municipios
    ADD CONSTRAINT ibge_municipios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ibge_populacao
    ADD CONSTRAINT ibge_populacao_pkey PRIMARY KEY (id);
ALTER TABLE ONLY import_validation_issues
    ADD CONSTRAINT import_validation_issues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY import_validation_runs
    ADD CONSTRAINT import_validation_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY in_app_notifications
    ADD CONSTRAINT in_app_notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY message_strategies
    ADD CONSTRAINT message_strategies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_abbreviation_unique UNIQUE (abbreviation);
ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_number_unique UNIQUE (number);
ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);
ALTER TABLE ONLY prediction_scenarios
    ADD CONSTRAINT prediction_scenarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY projection_reports
    ADD CONSTRAINT projection_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY report_recipients
    ADD CONSTRAINT report_recipients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY report_runs
    ADD CONSTRAINT report_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY report_schedules
    ADD CONSTRAINT report_schedules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY saved_reports
    ADD CONSTRAINT saved_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY scenario_candidates
    ADD CONSTRAINT scenario_candidates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY scenario_simulations
    ADD CONSTRAINT scenario_simulations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY scenario_votes
    ADD CONSTRAINT scenario_votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY semantic_documents
    ADD CONSTRAINT semantic_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY semantic_search_queries
    ADD CONSTRAINT semantic_search_queries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_analysis_results
    ADD CONSTRAINT sentiment_analysis_results_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_articles
    ADD CONSTRAINT sentiment_articles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_comparison_snapshots
    ADD CONSTRAINT sentiment_comparison_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_crisis_alerts
    ADD CONSTRAINT sentiment_crisis_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_data_sources
    ADD CONSTRAINT sentiment_data_sources_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_keywords
    ADD CONSTRAINT sentiment_keywords_pkey PRIMARY KEY (id);
ALTER TABLE ONLY sentiment_monitoring_sessions
    ADD CONSTRAINT sentiment_monitoring_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY simulations
    ADD CONSTRAINT simulations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_candidate_votes
    ADD CONSTRAINT tse_candidate_votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_electoral_statistics
    ADD CONSTRAINT tse_electoral_statistics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_import_batch_rows
    ADD CONSTRAINT tse_import_batch_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_import_batches
    ADD CONSTRAINT tse_import_batches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_import_errors
    ADD CONSTRAINT tse_import_errors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_import_jobs
    ADD CONSTRAINT tse_import_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY tse_party_votes
    ADD CONSTRAINT tse_party_votes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_unique UNIQUE (email);
ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY users
    ADD CONSTRAINT users_username_unique UNIQUE (username);
CREATE INDEX activity_campaign_idx ON campaign_activities USING btree (campaign_id);
CREATE INDEX activity_date_idx ON campaign_activities USING btree (scheduled_date);
CREATE INDEX activity_status_idx ON campaign_activities USING btree (status);
CREATE INDEX activity_type_idx ON campaign_activities USING btree (type);
CREATE INDEX ai_predictions_cache_key_idx ON ai_predictions USING btree (cache_key);
CREATE INDEX ai_predictions_type_idx ON ai_predictions USING btree (prediction_type);
CREATE INDEX ai_predictions_valid_until_idx ON ai_predictions USING btree (valid_until);
CREATE INDEX ai_sentiment_party_idx ON ai_sentiment_data USING btree (party);
CREATE INDEX ai_sentiment_published_at_idx ON ai_sentiment_data USING btree (published_at);
CREATE INDEX ai_sentiment_source_type_idx ON ai_sentiment_data USING btree (source_type);
CREATE INDEX articles_published_idx ON sentiment_articles USING btree (published_at);
CREATE INDEX articles_sentiment_idx ON sentiment_articles USING btree (sentiment_label);
CREATE INDEX articles_source_idx ON sentiment_articles USING btree (source_id);
CREATE INDEX articles_source_type_idx ON sentiment_articles USING btree (source_type);
CREATE INDEX assignee_activity_idx ON activity_assignees USING btree (activity_id);
CREATE INDEX assignee_member_idx ON activity_assignees USING btree (team_member_id);
CREATE INDEX budget_campaign_idx ON campaign_budgets USING btree (campaign_id);
CREATE INDEX budget_category_idx ON campaign_budgets USING btree (category);
CREATE INDEX campaign_dates_idx ON campaigns USING btree (start_date, end_date);
CREATE INDEX campaign_insight_party_idx ON campaign_insight_sessions USING btree (target_party_id);
CREATE INDEX campaign_insight_year_idx ON campaign_insight_sessions USING btree (election_year);
CREATE INDEX campaign_notif_campaign_idx ON campaign_notifications USING btree (campaign_id);
CREATE INDEX campaign_notif_recipient_idx ON campaign_notifications USING btree (recipient_user_id);
CREATE INDEX campaign_notif_scheduled_idx ON campaign_notifications USING btree (scheduled_for);
CREATE INDEX campaign_notif_type_idx ON campaign_notifications USING btree (type);
CREATE INDEX campaign_party_idx ON campaigns USING btree (target_party_id);
CREATE INDEX campaign_status_idx ON campaigns USING btree (status);
CREATE INDEX crisis_acknowledged_idx ON sentiment_crisis_alerts USING btree (is_acknowledged);
CREATE INDEX crisis_detected_idx ON sentiment_crisis_alerts USING btree (detected_at);
CREATE INDEX crisis_entity_idx ON sentiment_crisis_alerts USING btree (entity_type, entity_id);
CREATE INDEX crisis_severity_idx ON sentiment_crisis_alerts USING btree (severity);
CREATE INDEX dashboards_user_idx ON custom_dashboards USING btree (user_id);
CREATE INDEX forecast_results_entity_idx ON forecast_results USING btree (entity_name);
CREATE INDEX forecast_results_region_idx ON forecast_results USING btree (region);
CREATE INDEX forecast_results_run_idx ON forecast_results USING btree (run_id);
CREATE INDEX forecast_results_type_idx ON forecast_results USING btree (result_type);
CREATE INDEX forecast_runs_created_at_idx ON forecast_runs USING btree (created_at);
CREATE INDEX forecast_runs_status_idx ON forecast_runs USING btree (status);
CREATE INDEX forecast_runs_target_year_idx ON forecast_runs USING btree (target_year);
CREATE INDEX ibge_import_status_idx ON ibge_import_jobs USING btree (status);
CREATE INDEX ibge_import_type_idx ON ibge_import_jobs USING btree (type);
CREATE INDEX indicadores_ano_idx ON ibge_indicadores USING btree (ano);
CREATE INDEX indicadores_codigo_ano_idx ON ibge_indicadores USING btree (codigo_ibge, ano);
CREATE INDEX indicadores_municipio_idx ON ibge_indicadores USING btree (municipio_id);
CREATE INDEX keywords_entity_idx ON sentiment_keywords USING btree (entity_type, entity_id);
CREATE INDEX keywords_frequency_idx ON sentiment_keywords USING btree (frequency);
CREATE INDEX kpi_goal_campaign_idx ON ai_kpi_goals USING btree (campaign_id);
CREATE INDEX kpi_goal_name_idx ON ai_kpi_goals USING btree (kpi_name);
CREATE INDEX kpi_goal_session_idx ON ai_kpi_goals USING btree (ai_session_id);
CREATE INDEX kpi_goal_status_idx ON ai_kpi_goals USING btree (status);
CREATE INDEX mention_article_idx ON article_entity_mentions USING btree (article_id);
CREATE INDEX mention_entity_idx ON article_entity_mentions USING btree (entity_type, entity_id);
CREATE INDEX message_segment_idx ON message_strategies USING btree (segment_id);
CREATE INDEX message_session_idx ON message_strategies USING btree (session_id);
CREATE INDEX metric_campaign_idx ON campaign_metrics USING btree (campaign_id);
CREATE INDEX metric_date_idx ON campaign_metrics USING btree (metric_date);
CREATE INDEX metric_kpi_idx ON campaign_metrics USING btree (kpi_name);
CREATE INDEX monitoring_active_idx ON sentiment_monitoring_sessions USING btree (is_active);
CREATE INDEX monitoring_user_idx ON sentiment_monitoring_sessions USING btree (user_id);
CREATE INDEX municipio_codigo_idx ON ibge_municipios USING btree (codigo_ibge);
CREATE INDEX municipio_uf_idx ON ibge_municipios USING btree (uf);
CREATE INDEX notification_created_idx ON in_app_notifications USING btree (created_at);
CREATE INDEX notification_read_idx ON in_app_notifications USING btree (is_read);
CREATE INDEX notification_type_idx ON in_app_notifications USING btree (type);
CREATE INDEX notification_user_idx ON in_app_notifications USING btree (user_id);
CREATE INDEX populacao_ano_idx ON ibge_populacao USING btree (ano);
CREATE INDEX populacao_codigo_ano_idx ON ibge_populacao USING btree (codigo_ibge, ano);
CREATE INDEX populacao_municipio_idx ON ibge_populacao USING btree (municipio_id);
CREATE INDEX prediction_scenarios_status_idx ON prediction_scenarios USING btree (status);
CREATE INDEX prediction_scenarios_target_year_idx ON prediction_scenarios USING btree (target_year);
CREATE INDEX prediction_session_idx ON campaign_impact_predictions USING btree (session_id);
CREATE INDEX prediction_type_idx ON campaign_impact_predictions USING btree (prediction_type);
CREATE INDEX projection_reports_scope_idx ON projection_reports USING btree (scope);
CREATE INDEX projection_reports_status_idx ON projection_reports USING btree (status);
CREATE INDEX projection_reports_target_year_idx ON projection_reports USING btree (target_year);
CREATE INDEX report_session_idx ON campaign_insight_reports USING btree (session_id);
CREATE INDEX report_type_idx ON campaign_insight_reports USING btree (report_type);
CREATE INDEX resource_campaign_idx ON campaign_resources USING btree (campaign_id);
CREATE INDEX resource_status_idx ON campaign_resources USING btree (status);
CREATE INDEX resource_type_idx ON campaign_resources USING btree (type);
CREATE INDEX runs_schedule_idx ON report_runs USING btree (schedule_id);
CREATE INDEX runs_status_idx ON report_runs USING btree (status);
CREATE INDEX runs_template_idx ON report_runs USING btree (template_id);
CREATE INDEX schedule_active_idx ON report_schedules USING btree (is_active);
CREATE INDEX schedule_next_run_idx ON report_schedules USING btree (next_run_at);
CREATE INDEX segment_impact_idx ON high_impact_segments USING btree (impact_score);
CREATE INDEX segment_session_idx ON high_impact_segments USING btree (session_id);
CREATE INDEX semantic_documents_party_idx ON semantic_documents USING btree (party_abbreviation);
CREATE INDEX semantic_documents_source_idx ON semantic_documents USING btree (source_type, source_id);
CREATE INDEX semantic_documents_state_idx ON semantic_documents USING btree (state);
CREATE INDEX semantic_documents_year_idx ON semantic_documents USING btree (year);
CREATE INDEX sentiment_date_idx ON sentiment_analysis_results USING btree (analysis_date);
CREATE INDEX sentiment_entity_idx ON sentiment_analysis_results USING btree (entity_type, entity_id);
CREATE INDEX snapshot_date_idx ON sentiment_comparison_snapshots USING btree (snapshot_date);
CREATE INDEX snapshot_session_idx ON sentiment_comparison_snapshots USING btree (session_id);
CREATE INDEX sources_type_idx ON sentiment_data_sources USING btree (source_type);
CREATE INDEX suggestions_type_idx ON ai_suggestions USING btree (suggestion_type);
CREATE INDEX suggestions_user_idx ON ai_suggestions USING btree (user_id);
CREATE INDEX swing_regions_region_idx ON forecast_swing_regions USING btree (region);
CREATE INDEX swing_regions_run_idx ON forecast_swing_regions USING btree (run_id);
CREATE INDEX swing_regions_volatility_idx ON forecast_swing_regions USING btree (volatility_score);
CREATE INDEX team_member_active_idx ON campaign_team_members USING btree (is_active);
CREATE INDEX team_member_campaign_idx ON campaign_team_members USING btree (campaign_id);
CREATE INDEX team_member_user_idx ON campaign_team_members USING btree (user_id);
CREATE UNIQUE INDEX tse_candidate_votes_unique_idx ON tse_candidate_votes USING btree (ano_eleicao, cd_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_candidato, st_voto_em_transito);
CREATE INDEX tse_electoral_stats_municipio_idx ON tse_electoral_statistics USING btree (cd_municipio);
CREATE UNIQUE INDEX tse_electoral_stats_unique_idx ON tse_electoral_statistics USING btree (ano_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo);
CREATE INDEX tse_electoral_stats_year_uf_cargo_idx ON tse_electoral_statistics USING btree (ano_eleicao, sg_uf, cd_cargo);
CREATE INDEX tse_import_batch_rows_batch_idx ON tse_import_batch_rows USING btree (batch_id);
CREATE INDEX tse_import_batch_rows_status_idx ON tse_import_batch_rows USING btree (status);
CREATE INDEX tse_import_batches_job_idx ON tse_import_batches USING btree (import_job_id);
CREATE INDEX tse_import_batches_status_idx ON tse_import_batches USING btree (status);
CREATE INDEX tse_party_votes_municipio_idx ON tse_party_votes USING btree (cd_municipio);
CREATE INDEX tse_party_votes_party_idx ON tse_party_votes USING btree (nr_partido);
CREATE UNIQUE INDEX tse_party_votes_unique_idx ON tse_party_votes USING btree (ano_eleicao, cd_eleicao, nr_turno, sg_uf, cd_municipio, nr_zona, cd_cargo, nr_partido, st_voto_em_transito);
CREATE INDEX tse_party_votes_year_uf_cargo_idx ON tse_party_votes USING btree (ano_eleicao, sg_uf, cd_cargo);
CREATE INDEX validation_issues_run_idx ON import_validation_issues USING btree (run_id);
CREATE INDEX validation_issues_severity_idx ON import_validation_issues USING btree (severity);
CREATE INDEX validation_issues_status_idx ON import_validation_issues USING btree (status);
CREATE INDEX validation_issues_type_idx ON import_validation_issues USING btree (type);
CREATE INDEX validation_runs_job_idx ON import_validation_runs USING btree (job_id);
CREATE INDEX validation_runs_status_idx ON import_validation_runs USING btree (status);
ALTER TABLE ONLY activity_assignees
    ADD CONSTRAINT activity_assignees_activity_id_campaign_activities_id_fk FOREIGN KEY (activity_id) REFERENCES campaign_activities(id) ON DELETE CASCADE;
ALTER TABLE ONLY activity_assignees
    ADD CONSTRAINT activity_assignees_assigned_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE ONLY activity_assignees
    ADD CONSTRAINT activity_assignees_team_member_id_campaign_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES campaign_team_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_kpi_goals
    ADD CONSTRAINT ai_kpi_goals_ai_session_id_campaign_insight_sessions_id_fk FOREIGN KEY (ai_session_id) REFERENCES campaign_insight_sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY ai_kpi_goals
    ADD CONSTRAINT ai_kpi_goals_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_predictions
    ADD CONSTRAINT ai_predictions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY ai_suggestions
    ADD CONSTRAINT ai_suggestions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY alert_configurations
    ADD CONSTRAINT alert_configurations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY alliance_parties
    ADD CONSTRAINT alliance_parties_alliance_id_alliances_id_fk FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE;
ALTER TABLE ONLY alliance_parties
    ADD CONSTRAINT alliance_parties_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE;
ALTER TABLE ONLY alliances
    ADD CONSTRAINT alliances_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY alliances
    ADD CONSTRAINT alliances_scenario_id_scenarios_id_fk FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY article_entity_mentions
    ADD CONSTRAINT article_entity_mentions_article_id_sentiment_articles_id_fk FOREIGN KEY (article_id) REFERENCES sentiment_articles(id);
ALTER TABLE ONLY audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY campaign_activities
    ADD CONSTRAINT campaign_activities_budget_id_campaign_budgets_id_fk FOREIGN KEY (budget_id) REFERENCES campaign_budgets(id);
ALTER TABLE ONLY campaign_activities
    ADD CONSTRAINT campaign_activities_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_activities
    ADD CONSTRAINT campaign_activities_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY campaign_budgets
    ADD CONSTRAINT campaign_budgets_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_impact_predictions
    ADD CONSTRAINT campaign_impact_predictions_session_id_campaign_insight_session FOREIGN KEY (session_id) REFERENCES campaign_insight_sessions(id);
ALTER TABLE ONLY campaign_insight_reports
    ADD CONSTRAINT campaign_insight_reports_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY campaign_insight_reports
    ADD CONSTRAINT campaign_insight_reports_session_id_campaign_insight_sessions_i FOREIGN KEY (session_id) REFERENCES campaign_insight_sessions(id);
ALTER TABLE ONLY campaign_insight_sessions
    ADD CONSTRAINT campaign_insight_sessions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY campaign_insight_sessions
    ADD CONSTRAINT campaign_insight_sessions_target_candidate_id_candidates_id_fk FOREIGN KEY (target_candidate_id) REFERENCES candidates(id);
ALTER TABLE ONLY campaign_insight_sessions
    ADD CONSTRAINT campaign_insight_sessions_target_party_id_parties_id_fk FOREIGN KEY (target_party_id) REFERENCES parties(id);
ALTER TABLE ONLY campaign_metrics
    ADD CONSTRAINT campaign_metrics_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_in_app_notification_id_in_app_notificati FOREIGN KEY (in_app_notification_id) REFERENCES in_app_notifications(id);
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_recipient_user_id_users_id_fk FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_related_activity_id_campaign_activities_ FOREIGN KEY (related_activity_id) REFERENCES campaign_activities(id) ON DELETE SET NULL;
ALTER TABLE ONLY campaign_notifications
    ADD CONSTRAINT campaign_notifications_related_kpi_goal_id_ai_kpi_goals_id_fk FOREIGN KEY (related_kpi_goal_id) REFERENCES ai_kpi_goals(id) ON DELETE SET NULL;
ALTER TABLE ONLY campaign_resources
    ADD CONSTRAINT campaign_resources_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_team_members
    ADD CONSTRAINT campaign_team_members_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_team_members
    ADD CONSTRAINT campaign_team_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_ai_session_id_campaign_insight_sessions_id_fk FOREIGN KEY (ai_session_id) REFERENCES campaign_insight_sessions(id);
ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_target_candidate_id_candidates_id_fk FOREIGN KEY (target_candidate_id) REFERENCES candidates(id);
ALTER TABLE ONLY campaigns
    ADD CONSTRAINT campaigns_target_party_id_parties_id_fk FOREIGN KEY (target_party_id) REFERENCES parties(id);
ALTER TABLE ONLY candidate_comparisons
    ADD CONSTRAINT candidate_comparisons_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY candidates
    ADD CONSTRAINT candidates_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE;
ALTER TABLE ONLY custom_dashboards
    ADD CONSTRAINT custom_dashboards_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY event_impact_predictions
    ADD CONSTRAINT event_impact_predictions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY forecast_results
    ADD CONSTRAINT forecast_results_run_id_forecast_runs_id_fk FOREIGN KEY (run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY forecast_runs
    ADD CONSTRAINT forecast_runs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY forecast_swing_regions
    ADD CONSTRAINT forecast_swing_regions_run_id_forecast_runs_id_fk FOREIGN KEY (run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY high_impact_segments
    ADD CONSTRAINT high_impact_segments_session_id_campaign_insight_sessions_id_fk FOREIGN KEY (session_id) REFERENCES campaign_insight_sessions(id);
ALTER TABLE ONLY ibge_import_jobs
    ADD CONSTRAINT ibge_import_jobs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY ibge_indicadores
    ADD CONSTRAINT ibge_indicadores_municipio_id_ibge_municipios_id_fk FOREIGN KEY (municipio_id) REFERENCES ibge_municipios(id) ON DELETE CASCADE;
ALTER TABLE ONLY ibge_populacao
    ADD CONSTRAINT ibge_populacao_municipio_id_ibge_municipios_id_fk FOREIGN KEY (municipio_id) REFERENCES ibge_municipios(id) ON DELETE CASCADE;
ALTER TABLE ONLY import_validation_issues
    ADD CONSTRAINT import_validation_issues_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE ONLY import_validation_issues
    ADD CONSTRAINT import_validation_issues_run_id_import_validation_runs_id_fk FOREIGN KEY (run_id) REFERENCES import_validation_runs(id);
ALTER TABLE ONLY import_validation_runs
    ADD CONSTRAINT import_validation_runs_job_id_tse_import_jobs_id_fk FOREIGN KEY (job_id) REFERENCES tse_import_jobs(id);
ALTER TABLE ONLY in_app_notifications
    ADD CONSTRAINT in_app_notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY message_strategies
    ADD CONSTRAINT message_strategies_segment_id_high_impact_segments_id_fk FOREIGN KEY (segment_id) REFERENCES high_impact_segments(id);
ALTER TABLE ONLY message_strategies
    ADD CONSTRAINT message_strategies_session_id_campaign_insight_sessions_id_fk FOREIGN KEY (session_id) REFERENCES campaign_insight_sessions(id);
ALTER TABLE ONLY messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY prediction_scenarios
    ADD CONSTRAINT prediction_scenarios_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY prediction_scenarios
    ADD CONSTRAINT prediction_scenarios_forecast_run_id_forecast_runs_id_fk FOREIGN KEY (forecast_run_id) REFERENCES forecast_runs(id);
ALTER TABLE ONLY projection_reports
    ADD CONSTRAINT projection_reports_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY report_recipients
    ADD CONSTRAINT report_recipients_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY report_runs
    ADD CONSTRAINT report_runs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY report_runs
    ADD CONSTRAINT report_runs_schedule_id_report_schedules_id_fk FOREIGN KEY (schedule_id) REFERENCES report_schedules(id) ON DELETE SET NULL;
ALTER TABLE ONLY report_runs
    ADD CONSTRAINT report_runs_template_id_report_templates_id_fk FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY report_schedules
    ADD CONSTRAINT report_schedules_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY report_schedules
    ADD CONSTRAINT report_schedules_template_id_report_templates_id_fk FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY report_templates
    ADD CONSTRAINT report_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY saved_reports
    ADD CONSTRAINT saved_reports_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY scenario_candidates
    ADD CONSTRAINT scenario_candidates_candidate_id_candidates_id_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenario_candidates
    ADD CONSTRAINT scenario_candidates_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenario_candidates
    ADD CONSTRAINT scenario_candidates_scenario_id_scenarios_id_fk FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenario_simulations
    ADD CONSTRAINT scenario_simulations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY scenario_votes
    ADD CONSTRAINT scenario_votes_candidate_id_candidates_id_fk FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenario_votes
    ADD CONSTRAINT scenario_votes_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenario_votes
    ADD CONSTRAINT scenario_votes_scenario_id_scenarios_id_fk FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY scenarios
    ADD CONSTRAINT scenarios_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY semantic_search_queries
    ADD CONSTRAINT semantic_search_queries_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY sentiment_articles
    ADD CONSTRAINT sentiment_articles_source_id_sentiment_data_sources_id_fk FOREIGN KEY (source_id) REFERENCES sentiment_data_sources(id);
ALTER TABLE ONLY sentiment_comparison_snapshots
    ADD CONSTRAINT sentiment_comparison_snapshots_session_id_sentiment_monitoring_ FOREIGN KEY (session_id) REFERENCES sentiment_monitoring_sessions(id);
ALTER TABLE ONLY sentiment_crisis_alerts
    ADD CONSTRAINT sentiment_crisis_alerts_acknowledged_by_users_id_fk FOREIGN KEY (acknowledged_by) REFERENCES users(id);
ALTER TABLE ONLY sentiment_monitoring_sessions
    ADD CONSTRAINT sentiment_monitoring_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ONLY simulations
    ADD CONSTRAINT simulations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY simulations
    ADD CONSTRAINT simulations_scenario_id_scenarios_id_fk FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_candidate_votes
    ADD CONSTRAINT tse_candidate_votes_import_job_id_tse_import_jobs_id_fk FOREIGN KEY (import_job_id) REFERENCES tse_import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_electoral_statistics
    ADD CONSTRAINT tse_electoral_statistics_import_job_id_tse_import_jobs_id_fk FOREIGN KEY (import_job_id) REFERENCES tse_import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_import_batch_rows
    ADD CONSTRAINT tse_import_batch_rows_batch_id_tse_import_batches_id_fk FOREIGN KEY (batch_id) REFERENCES tse_import_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_import_batches
    ADD CONSTRAINT tse_import_batches_import_job_id_tse_import_jobs_id_fk FOREIGN KEY (import_job_id) REFERENCES tse_import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_import_errors
    ADD CONSTRAINT tse_import_errors_import_job_id_tse_import_jobs_id_fk FOREIGN KEY (import_job_id) REFERENCES tse_import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY tse_import_jobs
    ADD CONSTRAINT tse_import_jobs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE ONLY tse_party_votes
    ADD CONSTRAINT tse_party_votes_import_job_id_tse_import_jobs_id_fk FOREIGN KEY (import_job_id) REFERENCES tse_import_jobs(id) ON DELETE CASCADE;


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
