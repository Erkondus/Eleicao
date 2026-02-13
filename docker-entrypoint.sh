#!/bin/sh

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

strip_sslmode() {
  echo "$1" | sed 's/[?&]sslmode=[^&]*//g' | sed 's/?$//' | sed 's/&$//'
}

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

resolve_dns_to_ipv4() {
  if echo "$DB_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Host is already an IPv4 address: ${DB_HOST}"
    return
  fi

  echo "Resolving ${DB_HOST} to IPv4..."
  RESOLVED_IP=$(node -e "
    const dns = require('dns');
    dns.setDefaultResultOrder('ipv4first');
    dns.lookup('${DB_HOST}', { family: 4 }, (err, addr) => {
      if (err) { console.error('DNS_FAIL:' + err.message); process.exit(1); }
      console.log(addr);
    });
  " 2>&1) || true

  if echo "$RESOLVED_IP" | grep -q "DNS_FAIL"; then
    echo "WARNING: DNS resolution failed: ${RESOLVED_IP}"
    echo "Continuing with original hostname..."
    return
  fi

  if [ -n "$RESOLVED_IP" ] && echo "$RESOLVED_IP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "DNS resolved: ${DB_HOST} -> ${RESOLVED_IP}"
    export DATABASE_URL=$(echo "$DATABASE_URL" | sed "s|@${DB_HOST}|@${RESOLVED_IP}|g")
    DB_HOST="$RESOLVED_IP"
    echo "DATABASE_URL updated to use resolved IP"
  else
    echo "WARNING: Could not resolve to IPv4, using original hostname"
  fi
}

handle_ssl() {
  SSL_VAL=$(echo "${DATABASE_SSL:-auto}" | tr '[:upper:]' '[:lower:]')
  echo "DATABASE_SSL=${SSL_VAL}"

  if [ "$SSL_VAL" = "false" ] || [ "$SSL_VAL" = "0" ]; then
    echo "SSL: disabled"
    export DATABASE_URL=$(strip_sslmode "$DATABASE_URL")

  elif [ "$SSL_VAL" = "true" ] || [ "$SSL_VAL" = "1" ]; then
    echo "SSL: forced ON"
    case "$DATABASE_URL" in
      *sslmode=*) echo "SSL: sslmode already in URL" ;;
      *"?"*) export DATABASE_URL="${DATABASE_URL}&sslmode=require" ;;
      *) export DATABASE_URL="${DATABASE_URL}?sslmode=require" ;;
    esac

  else
    echo "SSL: auto mode - testing connection..."
    export DATABASE_URL=$(strip_sslmode "$DATABASE_URL")

    if node -e "
      const { Pool } = require('pg');
      const p = new Pool({
        connectionString: process.env.DATABASE_URL + '?sslmode=require',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
      });
      p.query('SELECT 1')
        .then(() => { p.end(); process.exit(0); })
        .catch(() => { p.end(); process.exit(1); });
    " 2>/dev/null; then
      echo "SSL: connected WITH SSL"
      export DATABASE_URL="${DATABASE_URL}?sslmode=require"
    else
      echo "SSL: SSL failed, testing without SSL..."
      if node -e "
        const { Pool } = require('pg');
        const p = new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 10000
        });
        p.query('SELECT 1')
          .then(() => { p.end(); process.exit(0); })
          .catch(() => { p.end(); process.exit(1); });
      " 2>/dev/null; then
        echo "SSL: connected WITHOUT SSL"
      else
        echo "SSL: both SSL and non-SSL connections failed"
        echo "WARNING: Database may be unreachable. Check DATABASE_URL."
      fi
    fi
  fi
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
      echo "WARNING: Could not reach database after ${MAX_RETRIES} attempts"
      echo "Proceeding anyway..."
      break
    fi
    echo "Waiting for database... (attempt ${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 2
  done
else
  echo "Database mode: EXTERNAL (Supabase/cloud)"
  echo "Host: ${DB_HOST}:${DB_PORT}"

  resolve_dns_to_ipv4
  handle_ssl

  echo "Final host: ${DB_HOST}"
fi

echo ""
echo "Running database schema sync (db:push)..."

if npm run db:push 2>&1; then
  echo "db:push completed successfully!"
else
  echo "db:push failed, retrying..."
  if npm run db:push --force 2>&1; then
    echo "db:push --force completed successfully!"
  else
    echo ""
    echo "============================================"
    echo "WARNING: db:push failed!"
    echo "============================================"
    echo "Tabelas podem nao ter sido criadas."
    echo ""
    echo "Para criar manualmente:"
    echo "1. SQL Editor do Supabase: cole scripts/create-tables.sql"
    echo "2. psql: psql \$DATABASE_URL -f scripts/create-tables.sql"
    echo "============================================"
  fi
fi

echo ""
echo "Starting application..."
exec npm start
