# SimulaVoto - Sistema de Simulação Eleitoral Brasileiro

## Overview
SimulaVoto is a web system designed to simulate Brazilian proportional electoral results according to the TSE system. It calculates electoral quotients, distributes seats, incorporates AI-powered predictions, provides role-based access control, and maintains a full audit trail. The project aims to offer advanced analytical capabilities for electoral data, including real-time import monitoring, automated report generation, AI-driven data validation, and predictive modeling for future elections. It targets political analysis, academic research, and electoral campaign strategizing by providing detailed insights, scenario analysis, and robust data management.

## User Preferences
- Usar TypeScript em todo o código
- Seguir padrões do shadcn/ui para componentes
- Validação com Zod schemas
- Design institucional inspirado no TSE (cores: #003366 azul, #FFD700 dourado)
- Suporte a tema claro/escuro

## System Architecture
The application features a React + Vite + TailwindCSS + shadcn/ui frontend and an Express.js + TypeScript backend. Data persistence is handled by PostgreSQL with Drizzle ORM. Authentication is managed via `passport-local` and `express-session`, implementing granular Role-Based Access Control (RBAC) with `admin`, `analyst`, and `viewer` roles, supporting custom permission overrides.

**Key Architectural Decisions:**
-   **Modularized Schema:** The database schema is organized into distinct modules (`users`, `electoral`, `tse`, `summaries`, `ai-predictions`, `sentiment`, `reports`, `campaigns`, `ibge`, `ai-config`) for clarity and maintainability.
-   **Modularized Backend Routes & Services:** Backend logic is separated into controllers (`routes`) and business logic (`services`) for better organization and reusability (e.g., `prediction-service`, `tse-import-service`).
-   **Componentized Frontend:** Frontend pages are structured with thin wrappers and dedicated component directories for each major feature (e.g., `campaigns/`, `tse-import/`, `predictions/`). Custom React hooks encapsulate feature-specific logic.
-   **Electoral Calculation:** Implements the Brazilian proportional electoral system fully compliant with TSE rules, including electoral quotients, party quotients, barrier clauses, and D'Hondt method for seat distribution, accounting for federations and abolished coalitions. Party total votes for QE/QP calculations include both legend votes (votos de legenda) and candidate nominal votes (votos nominais), as required by TSE rules. Quick Predictions with vote data use deterministic server-side seat calculation (not AI) — AI provides only qualitative analysis. Federation member party votes use totalPartyVotes (legend+nominal), not just legend votes.
-   **Dynamic CSV Format Detection:** The import system dynamically detects and adapts to varying TSE CSV formats across different election years for `PARTIDO`, `CANDIDATO`, and `DETALHE` data.
-   **AI-Powered Data Validation:** Integrates GPT-4o for quality scoring, risk assessment, and recommendations on imported data.
-   **Electoral Predictions & AI Insights:** Utilizes Monte Carlo simulations, historical trends, and AI (GPT-4o) for predictions, including voter turnout, candidate success, party performance, candidate comparisons, event impact, and what-if scenarios.
-   **Semantic Search:** Uses `pgvector` and OpenAI embeddings (`text-embedding-3-small`) for natural language queries on electoral data.
-   **Advanced Sentiment Analysis:** Aggregates data from multiple sources, uses GPT-4o for analysis, tracks entities, provides interactive visualizations, and includes a crisis alert system.
-   **AI Suggestions System:** Offers GPT-4o powered suggestions for charts, reports, and insights.
-   **Real-time Collaborative Editing:** Supports multi-user scenario editing with optimistic locking, WebSocket broadcasts for updates, and automatic cache invalidation.
-   **AI Performance Optimization:** Centralized AI call management (`cachedAiCall`) with DB-backed caching, configurable TTL, model tier selection (`gpt-4o-mini`, `gpt-4o`), reusable system prompts, prompt compression, and token limits. Supports multi-provider AI configuration.
-   **Saved Predictions History:** Persistent storage for ALL AI prediction results (`saved_predictions` table) with auto-save for all prediction types (quick predictions, scenario analysis, candidate comparisons, event impacts, what-if simulations, turnout, candidate-success, party-performance, electoral-insights, sentiment). Auto-versioning: each insight auto-saves with incrementing `version` per `predictionType`+`title` combination. Includes a dedicated "Histórico" tab in both the predictions page and the AI Insights page (`ai-insights.tsx`), with type filtering, grouped version display, expandable detail panels, full detail modal, and deletion. CRUD API endpoints at `/api/saved-predictions`.
-   **Database Performance Optimization:** Employs reduced redundant indexes, pre-aggregated summary tables (`summary_party_votes`, `summary_candidate_votes`, `summary_state_votes`) for fast analytics, atomic summary refresh logic, and post-import asynchronous maintenance tasks.
-   **Multi-Provider AI Configuration:** Allows administrators to manage AI providers (OpenAI, Anthropic, Google Gemini, OpenAI-compatible) and assign specific models per task, with API keys stored securely as environment variables.

## Security & Reliability
-   **Helmet:** HTTP security headers (CSP, X-Frame-Options, HSTS, etc.) via `helmet` middleware. CSP disabled in development for Vite compatibility.
-   **Rate Limiting:** `express-rate-limit` applied to `/api/auth/login` (20/15min), `/api/auth/reset-admin` (5/1h), and `/api/ai/*` (30/1min per user). AI rate limiter is registered after Passport middleware in `routes/index.ts` so `req.user` is available for per-user limiting; falls back to IP for unauthenticated requests.
-   **Log Sanitization:** API response bodies only logged for safe diagnostic routes (`/api/health`, `/api/version`, `/api/stats`) in development. No bodies logged in production. Truncated to 200 chars.
-   **SQL Injection Prevention:** Index names validated via regex and double-quoted in `DROP INDEX` statements.
-   **Timezone-Aware Scheduling:** `calculateNextRun()` uses `Intl` APIs to convert between timezone-local time and UTC, respecting the configured timezone parameter.
-   **React Query Caching:** `staleTime` set to 5 minutes (previously `Infinity`), `refetchOnWindowFocus` enabled for data freshness.
-   **Audit Log Pagination:** `/api/audit` supports `limit` and `offset` query params; frontend includes pagination controls.
-   **Gemini Multi-Turn:** `GeminiAdapter.chatCompletion` uses `startChat()` with proper history for multi-turn conversations instead of concatenating all messages.
-   **AI Adapter Cache TTL:** Adapter cache entries expire after 1 hour to avoid stale configurations. Cache also cleared on provider deletion.
-   **SSL CA Certificate:** Supports `DATABASE_SSL_CA` env var for `rejectUnauthorized: true` SSL connections to PostgreSQL. Falls back to `rejectUnauthorized: false` when no CA provided. All inline Node scripts in `docker-entrypoint.sh` also respect `DATABASE_SSL_CA`. Shell variable interpolation in entrypoint inline scripts uses `process.env` instead of direct `${VAR}` interpolation for safety. The `handle_ssl()` auto-detection now exports `DATABASE_SSL=disable` or `DATABASE_SSL=require` after probing, so downstream scripts (pre-migration, index restore) use the correct SSL config.
-   **Performance:** `getStats()` uses `Promise.all` (4 parallel queries); `getActivityTrend()` uses 2 `GROUP BY` queries instead of N+1 loop (14 → 2 queries).
-   **Auto-Versioning on Build:** `script/build.ts` automatically bumps the patch version and updates `buildDate` in `version.json` before each production build. If the version was already bumped today with the same target version, only `buildDate` is refreshed (prevents duplicate changelog entries on multiple builds in the same day). Manual bumps via `scripts/bump-version.ts` (minor/major) still work and take precedence.

## External Dependencies
-   **OpenAI:** GPT-4o, GPT-4o-mini for AI features (validation, insights, sentiment, predictions, suggestions) and `text-embedding-3-small` for semantic search.
-   **Anthropic:** Claude models (optional AI provider).
-   **Google Gemini:** Gemini models (optional AI provider).
-   **Resend:** For automated reports and email alerts.
-   **PostgreSQL:** Primary relational database.
-   **Drizzle ORM:** Object-Relational Mapper for database interactions.
-   **Passport.js (passport-local):** Authentication.
-   **Bcrypt:** Password hashing.
-   **Express.js:** Backend web framework.
-   **React, Vite, TailwindCSS, shadcn/ui:** Frontend development stack.
-   **csv-parse:** CSV parsing library.
-   **pgvector:** PostgreSQL extension for vector similarity search.