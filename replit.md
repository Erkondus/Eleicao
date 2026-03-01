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
-   **Electoral Calculation:** Implements the Brazilian proportional electoral system fully compliant with TSE rules, including electoral quotients, party quotients, barrier clauses, and D'Hondt method for seat distribution, accounting for federations and abolished coalitions. Party total votes for QE/QP calculations include both legend votes (votos de legenda) and candidate nominal votes (votos nominais), as required by TSE rules.
-   **Dynamic CSV Format Detection:** The import system dynamically detects and adapts to varying TSE CSV formats across different election years for `PARTIDO`, `CANDIDATO`, and `DETALHE` data.
-   **AI-Powered Data Validation:** Integrates GPT-4o for quality scoring, risk assessment, and recommendations on imported data.
-   **Electoral Predictions & AI Insights:** Utilizes Monte Carlo simulations, historical trends, and AI (GPT-4o) for predictions, including voter turnout, candidate success, party performance, candidate comparisons, event impact, and what-if scenarios.
-   **Semantic Search:** Uses `pgvector` and OpenAI embeddings (`text-embedding-3-small`) for natural language queries on electoral data.
-   **Advanced Sentiment Analysis:** Aggregates data from multiple sources, uses GPT-4o for analysis, tracks entities, provides interactive visualizations, and includes a crisis alert system.
-   **AI Suggestions System:** Offers GPT-4o powered suggestions for charts, reports, and insights.
-   **Real-time Collaborative Editing:** Supports multi-user scenario editing with optimistic locking, WebSocket broadcasts for updates, and automatic cache invalidation.
-   **AI Performance Optimization:** Centralized AI call management (`cachedAiCall`) with DB-backed caching, configurable TTL, model tier selection (`gpt-4o-mini`, `gpt-4o`), reusable system prompts, prompt compression, and token limits. Supports multi-provider AI configuration.
-   **Saved Predictions History:** Persistent storage for AI prediction results (`saved_predictions` table) with auto-save for quick predictions, manual save for other types, CRUD API endpoints, and organized by prediction type with search/filter capabilities.
-   **Database Performance Optimization:** Employs reduced redundant indexes, pre-aggregated summary tables (`summary_party_votes`, `summary_candidate_votes`, `summary_state_votes`) for fast analytics, atomic summary refresh logic, and post-import asynchronous maintenance tasks.
-   **Multi-Provider AI Configuration:** Allows administrators to manage AI providers (OpenAI, Anthropic, Google Gemini, OpenAI-compatible) and assign specific models per task, with API keys stored securely as environment variables.

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