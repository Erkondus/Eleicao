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
  " 2>&1)

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
    echo "SSL: auto mode - trying with SSL first..."
    export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/[?&]sslmode=[^&]*//g' | sed 's/\?$//')

    SSL_URL="${DATABASE_URL}?sslmode=require"
    if node -e "
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: '${SSL_URL}', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => { pool.end(); process.exit(1); });
    " 2>/dev/null; then
      echo "SSL: connection with SSL successful"
      export DATABASE_URL="${SSL_URL}"
    else
      echo "SSL: connection with SSL failed, using without SSL"
    fi
  fi
}

test_connection() {
  echo "Testing database connection..."
  node -e "
    const { Pool } = require('pg');
    const ssl = '${DATABASE_URL}'.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    const pool = new Pool({ connectionString: '${DATABASE_URL}', ssl: ssl || undefined, connectionTimeoutMillis: 15000 });
    pool.query('SELECT 1 as test')
      .then(res => { console.log('CONNECTION_OK'); pool.end(); process.exit(0); })
      .catch(err => { console.error('CONNECTION_FAIL:' + err.message); pool.end(); process.exit(1); });
  " 2>&1
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
  echo "Original host: ${DB_HOST}:${DB_PORT}"

  resolve_dns_to_ipv4

  handle_ssl

  echo "Final DATABASE_URL host: ${DB_HOST}"

  CONN_RESULT=$(test_connection)
  if echo "$CONN_RESULT" | grep -q "CONNECTION_OK"; then
    echo "Database connection verified successfully!"
  else
    echo "WARNING: Database connection test failed: ${CONN_RESULT}"
    echo "db:push may fail. Check your DATABASE_URL and network connectivity."
    echo ""
    echo "DICA: Se o dominio usa Cloudflare, use o IP direto do servidor na DATABASE_URL"
    echo "Exemplo: postgresql://postgres:SENHA@72.60.255.204:5432/postgres"
  fi
fi

echo ""
echo "Running database schema sync (db:push)..."
echo "DATABASE_URL (masked): postgresql://****@${DB_HOST}:${DB_PORT}/****"

npm run db:push 2>&1 && {
  echo "db:push completed successfully! Tables created/synced."
} || {
  echo ""
  echo "First db:push attempt failed. Retrying with --force..."
  npm run db:push --force 2>&1 && {
    echo "db:push --force completed successfully!"
  } || {
    echo ""
    echo "============================================"
    echo "WARNING: db:push failed!"
    echo "============================================"
    echo "As tabelas podem nao ter sido criadas."
    echo ""
    echo "Solucoes:"
    echo "1. Verifique a DATABASE_URL (use IP direto, nao dominio com Cloudflare)"
    echo "2. Verifique se o PostgreSQL aceita conexoes externas"
    echo "3. Execute manualmente no SQL Editor do Supabase:"
    echo "   - Copie o conteudo de scripts/create-tables.sql"
    echo "   - Cole e execute no SQL Editor"
    echo "4. Ou rode via psql:"
    echo "   psql \$DATABASE_URL -f scripts/create-tables.sql"
    echo "============================================"
    echo ""
    echo "The application will attempt to start anyway..."
  }
}

echo ""
echo "Starting application..."
exec npm start
