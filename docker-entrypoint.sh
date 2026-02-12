#!/bin/sh
set -e

echo "=== SimulaVoto - Sistema Eleitoral Brasileiro ==="
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-5000}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET environment variable is not set"
  exit 1
fi

DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')

if [ -z "$DB_HOST" ]; then
  DB_HOST="db"
fi
if [ -z "$DB_PORT" ]; then
  DB_PORT="5432"
fi

echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if node -e "const net = require('net'); const s = new net.Socket(); s.setTimeout(2000); s.connect(${DB_PORT}, '${DB_HOST}', () => { s.destroy(); process.exit(0); }); s.on('error', () => process.exit(1)); s.on('timeout', () => { s.destroy(); process.exit(1); });" 2>/dev/null; then
    echo "Database is reachable!"
    break
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "WARNING: Could not verify database connectivity after ${MAX_RETRIES} attempts"
    echo "Proceeding anyway - the application will retry on its own..."
    break
  fi
  echo "Waiting for database... (attempt ${RETRY_COUNT}/${MAX_RETRIES})"
  sleep 2
done

echo "Database: using PostgreSQL container (local)"
echo "Tables are initialized via init-db.sql on first run"

echo "Starting application..."
exec npm start
