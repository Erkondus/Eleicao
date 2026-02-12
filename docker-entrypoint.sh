#!/bin/sh
set -e

echo "=== SimulaVoto - Sistema Eleitoral Brasileiro ==="
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-5000}"

if [ -z "$DATABASE_URL" ] && [ -z "$POSTGRES_PASSWORD" ]; then
  echo "ERROR: DATABASE_URL or POSTGRES_PASSWORD must be set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "ERROR: SESSION_SECRET environment variable is not set"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  PG_HOST="${POSTGRES_HOST:-db}"
  PG_PORT="${POSTGRES_PORT:-5432}"
  PG_USER="${POSTGRES_USER:-simulavoto}"
  PG_DB="${POSTGRES_DB:-simulavoto}"
  export DATABASE_URL="postgresql://${PG_USER}:${POSTGRES_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}"
  echo "DATABASE_URL constructed from POSTGRES_PASSWORD"
fi

DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')

if [ -z "$DB_HOST" ]; then
  DB_HOST="db"
fi
if [ -z "$DB_PORT" ]; then
  DB_PORT="5432"
fi

is_local_db() {
  case "$DB_HOST" in
    localhost|127.0.0.1|db|172.*|192.168.*|10.*)
      return 0
      ;;
    *)
      if echo "$DB_HOST" | grep -qv '\.'; then
        return 0
      fi
      return 1
      ;;
  esac
}

if is_local_db; then
  echo "Database mode: LOCAL (container/internal)"
  echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
  MAX_RETRIES=60
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
else
  echo "Database mode: EXTERNAL (Supabase/cloud)"
  echo "Connecting to: ${DB_HOST}:${DB_PORT}"
  echo "DNS resolution: IPv4 forced via NODE_OPTIONS"

  SSL_VAL=$(echo "${DATABASE_SSL:-auto}" | tr '[:upper:]' '[:lower:]')
  if [ "$SSL_VAL" = "false" ] || [ "$SSL_VAL" = "0" ]; then
    echo "SSL: disabled via DATABASE_SSL=false"
    export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/[?&]sslmode=[^&]*//g' | sed 's/\?$//')
  elif [ "$SSL_VAL" = "true" ] || [ "$SSL_VAL" = "1" ]; then
    echo "SSL: forced ON via DATABASE_SSL=true"
    case "$DATABASE_URL" in
      *sslmode=*) echo "SSL: sslmode already present in DATABASE_URL" ;;
      *\?*) export DATABASE_URL="${DATABASE_URL}&sslmode=require" ;;
      *) export DATABASE_URL="${DATABASE_URL}?sslmode=require" ;;
    esac
  else
    echo "SSL: auto mode - app will try SSL first, fallback without"
    export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/[?&]sslmode=[^&]*//g' | sed 's/\?$//')
  fi
fi

echo "Running database schema sync (db:push)..."
npm run db:push 2>&1 || {
  echo "Retrying with --force flag..."
  npm run db:push --force 2>&1 || {
    echo "WARNING: db:push failed. Tables may need to be created manually."
    echo "The application will attempt to start anyway..."
  }
}

echo "Starting application..."
exec npm start
