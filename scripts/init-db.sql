-- SimulaVoto - Database Initialization Script for PostgreSQL (Docker Standalone)
-- Este script cria apenas as extensoes necessarias
-- As tabelas sao criadas automaticamente pelo Drizzle ORM (db:push) no inicio da aplicacao
-- Executado automaticamente pelo container PostgreSQL no primeiro deploy

-- ===========================================
-- EXTENSOES
-- ===========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===========================================
-- USUARIO ADMIN PADRAO
-- ===========================================
-- O usuario admin e criado pela aplicacao no primeiro inicio
-- Credenciais padrao: admin / admin123
