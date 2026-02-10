#!/bin/sh
set -e

echo "=== SimulaVoto - Sistema Eleitoral Brasileiro ==="
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-5000}"
echo "NODE_OPTIONS: ${NODE_OPTIONS:-not set}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET environment variable is not set"
  exit 1
fi

echo "Database: using PostgreSQL container (local)"
echo "Tables are initialized via init-db.sql on first run"

echo "Starting application..."
exec npm start
