#!/bin/sh
set -e

echo "=== SimulaVoto - Sistema Eleitoral Brasileiro ==="
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-5000}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Running database migrations..."
npm run db:push

echo "Starting application..."
exec npm start
