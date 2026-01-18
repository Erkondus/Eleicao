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

# Skip db:push - use init-db.sql manually in Supabase SQL Editor
# This avoids IPv6 connectivity issues with drizzle-kit
echo "Database migrations should be run manually via init-db.sql"
echo "See DEPLOY.md for instructions"

echo "Starting application..."
exec npm start
