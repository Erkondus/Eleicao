# SimulaVoto - Sistema de Simulação Eleitoral Brasileiro

## Overview
SimulaVoto is a comprehensive web system designed to simulate Brazilian proportional electoral results according to the TSE system. It calculates electoral quotients, distributes seats using the D'Hondt method, incorporates AI-powered predictions, provides role-based access control, and maintains a full audit trail. The project aims to offer advanced analytical capabilities for electoral data, including real-time import monitoring, automated report generation, AI-driven data validation, and predictive modeling for future elections. It targets market potential in political analysis, academic research, and electoral campaign strategizing by providing detailed insights, scenario analysis, and robust data management.

## User Preferences
- Usar TypeScript em todo o código
- Seguir padrões do shadcn/ui para componentes
- Validação com Zod schemas
- Design institucional inspirado no TSE (cores: #003366 azul, #FFD700 dourado)
- Suporte a tema claro/escuro

## System Architecture
The application is built with a React + Vite + TailwindCSS + shadcn/ui frontend, an Express.js + TypeScript backend, and PostgreSQL with Drizzle ORM for the database. Authentication is handled via `passport-local` and `express-session`, implementing Role-Based Access Control (RBAC) with `admin`, `analyst`, and `viewer` roles.

**Backend Route Structure (Modularized):**
- `server/routes/index.ts` - Main entry: session/passport setup, router mounting
- `server/routes/shared.ts` - Shared middleware: requireAuth, requireRole, logAudit, upload, calculateNextRun
- `server/routes/auth.ts` - Authentication, users, health, stats, audit
- `server/routes/electoral.ts` - Parties, candidates, scenarios, simulations, electoral calculation (D'Hondt)
- `server/routes/tse-import.ts` - TSE CSV import with queue system, batch processing, historical elections
- `server/routes/analytics.ts` - Analytics dashboard, data export, drill-down queries
- `server/routes/ai.ts` - AI predictions, forecasts, semantic search, reports, dashboards, suggestions
- `server/routes/sentiment.ts` - Sentiment analysis, monitoring sessions, crisis alerts, notifications
- `server/routes/ibge.ts` - IBGE data import (municipios, populacao, indicadores)
- `server/routes/campaigns.ts` - Campaign management, insights, team, KPI, calendar, budgets

**Key Features and Implementations:**
- **Electoral Calculation:** Implements the Brazilian proportional electoral system with full TSE compliance:
  - Quociente Eleitoral (QE) = floor(votos_válidos / vagas) (Art. 106 CE)
  - Quociente Partidário (QP) = floor(votos_entidade / QE) (Art. 107 CE)
  - Cláusula de barreira: 80% do QE para participar das sobras (Art. 108 §1º, Lei 14.211/2021)
  - Votação mínima individual: 20% do QE para eleição (Art. 108 §1º-A)
  - Distribuição de sobras por D'Hondt (maiores médias) entre entidades que atingiram barreira
  - Federações partidárias como entidade única (Lei 14.208/2021)
  - Coligações abolidas para eleições proporcionais (Lei 14.211/2021)
  - Edge case: sem QE atingido → D'Hondt entre todos os partidos com votos
  - Desempate no D'Hondt por total de votos
- **Data Import System:** Robust CSV import from TSE URLs with streaming, real-time progress updates via WebSockets, and re-processing of failed batches. Batch tracking with original file row indices for accurate audit trails. All three import types (PARTIDO, DETALHE, CANDIDATO) use consistent duplicate checking and row tracking. Includes an enhanced IBGE import system with detailed error reporting, real-time progress, and cancel/restart capabilities.
  - **Dynamic CSV Format Detection:** The TSE changed CSV formats across election years. The system auto-detects column count and applies appropriate field mappings:
    - **PARTIDO (votacao_partido_munzona):**
      - Legacy (≤23 cols): 2010 and earlier - minimal structure
      - Intermediate (24-30 cols): 2002-2014 - has coligação but NO federation (28 cols)
      - Modern (>30 cols): 2018-2022+ - has federation fields (36-38 cols)
    - **CANDIDATO (votacao_candidato_munzona):**
      - Legacy (≤38 cols): 2002-2014 - NO julgamento/cassação fields, NO federation (38 cols)
      - Modern (>38 cols): 2018-2022+ - has julgamento/cassação and federation fields (50 cols)
    - **DETALHE (detalhe_votacao_munzona):** Consistent 47-column format across all years (2014-2022)
- **AI-Powered Data Validation:** Integrates GPT-4o for quality scoring, risk assessment, and recommendations on imported data, alongside deterministic checks.
- **Automated Reporting:** System for creating, scheduling, and generating reports (CSV/PDF) with various frequencies and types, supporting email delivery.
- **Electoral Predictions & AI Insights:** Utilizes Monte Carlo simulations, historical trend analysis, and AI-generated narratives. Includes advanced predictive analytics for voter turnout, candidate success, and party performance, with new prediction types like Candidate Comparison, Event Impact, and What-If Scenarios.
- **Semantic Search:** Implemented with `pgvector` for natural language queries on electoral data, using OpenAI `text-embedding-3-small` for embeddings.
- **Dashboard & Analytics:** Interactive dashboard with a map of Brazil, consolidated metrics, and import status. Advanced analytics with customizable reports, historical comparisons, trend analysis, anomaly detection, and custom dashboards.
- **System Administration:** Admin panel with database statistics, reset options, and detailed error reporting.
- **Audit Trail:** Comprehensive logging of all user operations and system changes.
- **UI/UX:** Adherence to shadcn/ui patterns, institutional design inspired by TSE colors, and support for light/dark themes.
- **External Data Integration:** Real-time integration with external news sources (Google News RSS, NewsAPI) and social media (Twitter/X) for article enrichment and sentiment analysis.
- **Advanced Sentiment Analysis:** Comprehensive system with multi-source data aggregation, GPT-4o powered analysis, entity-level tracking, interactive word clouds, temporal evolution charts, and multi-entity comparison. Includes a crisis alert system with severity levels and notifications.
- **AI Suggestions System:** GPT-4o powered suggestions for charts, reports, and insights.
- **Real-time Notification System:** In-app notifications with WebSocket delivery and email alerts for critical events.
- **Campaign Insights AI Module:** AI-powered module for campaign strategy analysis including high-impact segment identification, message strategy generation, campaign impact prediction, and executive report generation.
- **Campaign Management Module:** Comprehensive management with team roles, calendar visualization, AI-powered KPI goal tracking, and activity assignment.
- **Real-time Collaborative Editing:** Multi-user scenario editing with optimistic locking (expectedUpdatedAt on PUT/DELETE for scenario candidates), WebSocket broadcast of scenario.candidate.added/updated/deleted events, and automatic React Query cache invalidation via `useScenarioWebSocket` hook. 409 conflict detection with user-friendly toast messages and automatic data refresh.

## External Dependencies
- **OpenAI:** GPT-4o for AI integrations (validation, insights, sentiment, predictions, suggestions) and `text-embedding-3-small` for semantic search.
- **Resend:** For sending automated reports and email alerts.
- **PostgreSQL:** Primary database.
- **Drizzle ORM:** Object-Relational Mapper.
- **Passport.js (passport-local):** Authentication strategy.
- **Bcrypt:** Password hashing.
- **Express.js:** Web application framework.
- **React, Vite, TailwindCSS, shadcn/ui:** Frontend development stack.
- **csv-parse:** CSV parsing for data imports.
- **pgvector:** PostgreSQL extension for vector similarity search.