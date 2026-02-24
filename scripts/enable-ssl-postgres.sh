#!/bin/bash
set -e

echo "============================================"
echo " SimulaVoto - Preparar SSL no PostgreSQL"
echo " (Para uso com Portainer)"
echo "============================================"
echo ""

SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
CERTS_DIR="${SUPABASE_DIR}/volumes/db/certs"
DB_CONTAINER="supabase-db"

echo "[1/3] Criando diretório de certificados..."
mkdir -p "$CERTS_DIR"
echo "  -> ${CERTS_DIR}"

echo ""
echo "[2/3] Gerando certificado SSL autoassinado (válido por 10 anos)..."
if [ -f "$CERTS_DIR/server.crt" ] && [ -f "$CERTS_DIR/server.key" ]; then
  echo "  Certificados já existem. Deseja sobrescrever? (s/N)"
  read -r RESPOSTA
  if [ "$RESPOSTA" != "s" ] && [ "$RESPOSTA" != "S" ]; then
    echo "  Mantendo certificados existentes."
  else
    openssl req -new -x509 -days 3650 -nodes \
      -text -out "$CERTS_DIR/server.crt" \
      -keyout "$CERTS_DIR/server.key" \
      -subj "/CN=supabase-db" 2>/dev/null
    echo "  Certificados gerados com sucesso."
  fi
else
  openssl req -new -x509 -days 3650 -nodes \
    -text -out "$CERTS_DIR/server.crt" \
    -keyout "$CERTS_DIR/server.key" \
    -subj "/CN=supabase-db" 2>/dev/null
  echo "  Certificados gerados com sucesso."
fi

echo ""
echo "[3/3] Ajustando permissões dos certificados..."
chmod 600 "$CERTS_DIR/server.key"
chmod 644 "$CERTS_DIR/server.crt"
chown 999:999 "$CERTS_DIR/server.key"
chown 999:999 "$CERTS_DIR/server.crt"
echo "  -> server.key: 600 (owner: 999:999)"
echo "  -> server.crt: 644 (owner: 999:999)"

echo ""
echo "============================================"
echo " Certificados prontos!"
echo "============================================"
echo ""
echo "Arquivos criados:"
echo "  ${CERTS_DIR}/server.crt"
echo "  ${CERTS_DIR}/server.key"
echo ""
ls -la "$CERTS_DIR/"
echo ""
echo "============================================"
echo " Agora configure no Portainer:"
echo "============================================"
echo ""
echo "1. Abra o Portainer e vá na stack do Supabase"
echo ""
echo "2. No serviço 'db', ADICIONE estes 2 volumes:"
echo "   ${CERTS_DIR}/server.crt:/var/lib/postgresql/server.crt:ro"
echo "   ${CERTS_DIR}/server.key:/var/lib/postgresql/server.key:ro"
echo ""
echo "3. No serviço 'db', ADICIONE este command:"
echo "   command: >"
echo "     postgres"
echo "     -c ssl=on"
echo "     -c ssl_cert_file=/var/lib/postgresql/server.crt"
echo "     -c ssl_key_file=/var/lib/postgresql/server.key"
echo ""
echo "4. Clique em 'Update the stack' no Portainer"
echo ""
echo "5. Após reiniciar, verifique com:"
echo "   docker exec ${DB_CONTAINER} psql -U postgres -c 'SHOW ssl;'"
echo "   (Deve retornar 'on')"
echo ""
echo "============================================"
echo " Trecho YAML para copiar no Portainer:"
echo "============================================"
echo ""
cat << 'YAML_BLOCK'
  db:
    container_name: supabase-db
    image: supabase/postgres:15.8.1.085
    ports:
      - "5432:5432"
    restart: unless-stopped
    volumes:
      - /opt/supabase/volumes/db/data:/var/lib/postgresql/data:Z
      - /opt/supabase/volumes/db/init-scripts:/docker-entrypoint-initdb.d/init-scripts:Z
      - /opt/supabase/volumes/db/certs/server.crt:/var/lib/postgresql/server.crt:ro
      - /opt/supabase/volumes/db/certs/server.key:/var/lib/postgresql/server.key:ro
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
    command: >
      postgres
      -c ssl=on
      -c ssl_cert_file=/var/lib/postgresql/server.crt
      -c ssl_key_file=/var/lib/postgresql/server.key
    networks:
      - supabase_network
YAML_BLOCK
echo ""
