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

# Force Node.js to prefer IPv4 over IPv6 for DNS resolution
# This fixes ENETUNREACH errors with Supabase/cloud databases
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"

echo "Running database migrations..."
npm run db:push || {
  echo "WARNING: Database migration failed, continuing anyway..."
  echo "Make sure to run init-db.sql manually if this is a fresh database"
}

echo "Starting application..."
exec npm start
