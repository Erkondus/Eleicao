# SimulaVoto - Sistema de Simulação Eleitoral Brasileiro

## Overview
SimulaVoto is a comprehensive web system designed to simulate Brazilian proportional electoral results according to the TSE (Tribunal Superior Eleitoral) system. It calculates electoral quotients, distributes seats using the D'Hondt method, incorporates AI-powered predictions, provides role-based access control, and maintains a full audit trail. The project aims to offer advanced analytical capabilities for electoral data, including real-time import monitoring, automated report generation, AI-driven data validation, and predictive modeling for future elections. It targets market potential in political analysis, academic research, and electoral campaign strategizing by providing detailed insights, scenario analysis, and robust data management.

## User Preferences
- Usar TypeScript em todo o código
- Seguir padrões do shadcn/ui para componentes
- Validação com Zod schemas
- Design institucional inspirado no TSE (cores: #003366 azul, #FFD700 dourado)
- Suporte a tema claro/escuro

## System Architecture
The application is built with a React + Vite + TailwindCSS + shadcn/ui frontend, an Express.js + TypeScript backend, and PostgreSQL with Drizzle ORM for the database. Authentication is handled via `passport-local` and `express-session`, implementing Role-Based Access Control (RBAC) with `admin`, `analyst`, and `viewer` roles.

**Key Features and Implementations:**
- **Electoral Calculation:** Implements the Brazilian proportional electoral system, including electoral quotient, party quotient, initial seat distribution, and D'Hondt method for remaining seats. Supports Federations (2022+) and Coalitions (pre-2022).
- **Data Import System:** Robust CSV import (up to 5GB) from TSE URLs with streaming, real-time progress updates, and detailed batch tracking. Includes real-time import monitoring via WebSockets and re-processing of failed batches.
- **AI-Powered Data Validation:** Integrates GPT-4o for quality scoring, risk assessment, and recommendations on imported data, alongside deterministic checks for data integrity.
- **Automated Reporting:** A system for creating, scheduling, and generating reports (CSV/PDF) with various frequencies and types (candidates, parties, voting details). Supports email delivery via Resend.
- **Electoral Predictions & AI Insights:** Utilizes Monte Carlo simulations (10,000 iterations) for robust confidence intervals. Features historical trend analysis, identification of swing regions, and AI-generated narratives. Includes advanced predictive analytics for voter turnout, candidate success, and party performance.
- **Semantic Search:** Implemented with `pgvector` for natural language queries on electoral data, using OpenAI `text-embedding-3-small` for automatic embeddings.
- **Dashboard & Analytics:** Interactive dashboard with a map of Brazil, consolidated metrics, and import status. Advanced analytics section with customizable reports, historical comparisons, trend analysis, and anomaly detection.
- **System Administration:** Admin panel with database statistics, the option to reset the database (preserving admin user), and detailed error reporting with statistical summaries and resolution guidance.
- **Audit Trail:** Comprehensive logging of all user operations and system changes.
- **UI/UX:** Adherence to shadcn/ui patterns, institutional design inspired by TSE colors, and support for light/dark themes.

**Data Models:**
- `users`: User authentication and roles.
- `parties`: Political party information.
- `candidates`: Candidate details.
- `scenarios`: Electoral simulation scenarios.
- `simulations`: Simulation results.
- `auditLogs`: Audit trail records.
- `scenarioVotes`: Votes per scenario.
- `tseImportBatches`, `tseImportBatchRows`: Granular tracking of import batches.
- `import_validation_runs`, `import_validation_issues`: AI validation results.
- `report_templates`, `report_schedules`, `report_runs`, `report_recipients`: Report automation configurations.
- `forecast_runs`, `forecast_results`, `forecast_swing_regions`: Predictive forecast data.
- `customDashboards`: User-customizable dashboards with layout, filters, and widgets configuration.
- `aiSuggestions`: AI-generated chart and report suggestions with relevance scores.
- `sentimentDataSources`: External data sources for sentiment analysis (news, blogs, forums).
- `sentimentArticles`: Collected articles from various sources for sentiment analysis with sourceType and sentiment classification fields.
- `sentimentAnalysisResults`: Historical sentiment scores and analysis per entity (party, candidate).
- `sentimentKeywords`: Aggregated keywords for word cloud visualization with frequency and sentiment tracking.
- `sentimentCrisisAlerts`: Automatic crisis alerts with severity levels, sentiment change tracking, and acknowledgment workflow.
- `sentimentMonitoringSessions`: Multi-entity monitoring sessions with customizable filters and alert thresholds.
- `sentimentComparisonSnapshots`: Historical snapshots of multi-entity comparison analyses.
- `articleEntityMentions`: Entity-level mentions extracted from articles for detailed entity tracking.
- `alertConfigurations`: Configurable thresholds for crisis detection per user/entity.
- `inAppNotifications`: Real-time in-app notifications with WebSocket delivery.
- `ibgeMunicipios`: Brazilian municipality data from IBGE with geographic information.
- `ibgePopulacao`: Population estimates by municipality and year from IBGE/SIDRA.
- `ibgeIndicadores`: Socioeconomic indicators (IDH, income, education, infrastructure) per municipality.
- `ibgeImportJobs`: Import job tracking for IBGE data operations.

## Recent Changes (January 2026)
- **IBGE Import Cancel/Restart:** Added ability to cancel running IBGE import jobs and restart failed/cancelled jobs. Backend tracks cancelled jobs and checks during import loops. UI shows cancel/restart buttons per job status.
- **Database Reset with IBGE:** The "Zerar Banco de Dados" function now also clears all IBGE data (municipalities, population, indicators, import jobs). Total of 26 tables cleared.
- **TypeScript Fixes:** Resolved 17 TypeScript errors in routes.ts for clean production build. Fixed type mismatches in sentiment analysis, forecasting, and electoral data endpoints.
- **Production SQL Fixes:** New comprehensive SQL script (`scripts/fix-all-columns-production.sql`) that corrects all schema mismatches between code and production database.
- **Enhanced Visualizations & PDF Export:** Interactive Brazil map on dashboard with state click for electoral data summary. Dynamic charts (bar charts with error margins, composed charts for before/after comparisons) in predictions. PDF export functionality for all AI prediction types with professional TSE-styled documents.
- **Advanced Predictive Models:** New sophisticated prediction types including Candidate Comparison (compare 2+ candidates with AI analysis), Event Impact Predictions (before/after projections for political events), and What-If Scenario Simulations (e.g., "What if candidate X changes party?"). All features include full CRUD UI with GPT-4o powered analysis and detailed insights.
- **External Data Integration:** Real-time integration with external news sources (Google News RSS, NewsAPI) and social media trends (Twitter/X). Features article enrichment with GPT-4o AI, automatic party identification, deduplication, and persistence to sentiment_articles table. New "Dados Externos" tab in sentiment analysis displays recent articles, trending topics, and active data sources.
- **Advanced Sentiment Analysis:** Comprehensive sentiment analysis system with multi-source data aggregation (news, blogs, forums) from Brazil, Spain, and UK. Features GPT-4o powered analysis, entity-level sentiment tracking, interactive word cloud visualization, and temporal evolution charts.
- **AI Suggestions System:** Added GPT-4o powered suggestions for charts, reports, and insights based on electoral data analysis.
- **Multi-Year Comparison:** API endpoint for comparing electoral data across different election years with party vote analysis.
- **Advanced Data Segmentation:** Municipality-level filtering with detailed vote aggregation by position and party.
- **Custom Dashboards:** Full CRUD for user-customizable dashboards with public/private visibility and saved filter configurations.
- **Multi-Entity Sentiment Comparison:** New "Comparação" tab in sentiment analysis allows comparing sentiment across multiple parties/candidates simultaneously with interactive bar charts and AI-generated comparative narratives.
- **Crisis Alert System:** Automatic detection of sentiment crises with severity levels (low/medium/high/critical). New "Alertas" tab displays alerts with acknowledgment functionality, statistics on unacknowledged alerts, and detailed alert history.
- **Sentiment Monitoring Sessions:** Create and manage monitoring sessions for tracking multiple entities over time with customizable alert thresholds and source filters.
- **GPT-4o Sentiment Classification:** Advanced article-level sentiment classification with entity extraction, keyword identification, and confidence scoring. Batch classification API for processing up to 20 articles at once.
- **IBGE Demographic Data Integration:** Direct import of Brazilian demographic data from IBGE SIDRA API. Includes municipalities (5,570), population estimates by year, and socioeconomic indicators (IDH, income, education) based on IBGE regional patterns. New "Dados IBGE" page with import buttons, progress tracking, and data visualization. Demographic data enhances AI prediction models with population and socioeconomic context. Features cancel and restart functionality for import jobs.
- **Real-time Notification System:** In-app notifications with WebSocket delivery and notification bell in header. Email alerts for critical/high severity crises via Resend. Configurable alert thresholds per user/entity with rate limiting.
- **Dashboard Sentiment Integration:** Electoral Dashboard now includes sentiment trends widget with bar charts showing entity sentiment scores and crisis alert display with links to full analysis.
- **Campaign Insights AI Module:** Comprehensive AI-powered module for campaign strategy analysis featuring:
  - High-Impact Segment Identification: GPT-4o analysis to identify voter demographics and regions with highest campaign potential, with quantitative metrics (impact score, conversion potential, volatility)
  - Message Strategy Generation: AI-suggested communication strategies per segment with tone recommendations, channel suggestions, topics to emphasize/avoid
  - Campaign Impact Prediction: Predictive modeling for investment outcomes using Monte Carlo simulation, logistic regression, and elasticity analysis
  - Executive Report Generation: Automated generation of comprehensive strategy reports with visualizations
  - Interactive Dashboard: Visual analytics with charts showing segment impact scores, sentiment vs volatility radar charts, and prediction results
- **Campaign Management Module Enhanced:** Comprehensive campaign management with new features:
  - Team Management: Add/remove team members with role-based assignments (coordinator, manager, member, volunteer). Track join dates and user enrichment.
  - Calendar Visualization: Monthly grid view with activities color-coded by type (events, meetings, milestones, actions). Navigation controls and upcoming activities list.
  - KPI Goal Tracking: AI-powered KPI recommendations via GPT-4o with suggested targets, rationale, priority, and confidence scores. Manual goal creation with baseline/current/target tracking, priority badges, and progress visualization.
  - Activity Assignees: Many-to-many relationship for assigning team members to campaign activities.
  - Notification Integration: Automatic notifications for team additions, task assignments, and campaign status changes.

## External Dependencies
- **OpenAI:** Used for AI integrations (GPT-4o for validation and insights, `text-embedding-3-small` for semantic search).
- **Resend:** For sending automated reports via email.
- **PostgreSQL:** Primary database.
- **Drizzle ORM:** Object-Relational Mapper for database interactions.
- **Passport.js (passport-local):** Authentication strategy.
- **Bcrypt:** Password hashing.
- **Express.js:** Web application framework.
- **React, Vite, TailwindCSS, shadcn/ui:** Frontend development stack.
- **csv-parse:** Robust CSV parsing for data imports.
- **pgvector:** PostgreSQL extension for vector similarity search.

## Deploy / Production Update

### Atualização Rápida (Apenas Código)
Quando não há mudanças no banco, apenas correções de código:
```bash
cd /opt/simulavoto
git fetch origin && git pull origin main
docker compose up -d --build
```

### Atualização Completa (Com Migrações de Banco)
Quando há novas tabelas ou colunas:
```bash
cd /opt/simulavoto
git fetch origin && git pull origin main

# 1. Executar SQL de correção no Supabase SQL Editor:
#    scripts/fix-all-columns-production.sql

# 2. Rebuild e restart
docker compose up -d --build
```

### Scripts SQL Importantes
- `scripts/init-db.sql` - Criação inicial das tabelas
- `scripts/migration-2026-01.sql` - Migrações de Janeiro 2026
- `scripts/fix-all-columns-production.sql` - Correção completa de colunas (usar este!)

### Documentação de Deploy
- `DEPLOY.md` - Guia completo de deploy
- `DEPLOY-PORTAINER.md` - Deploy com Portainer
- `DEPLOY-UPDATE-PORTAINER.md` - Atualização de ambiente existente