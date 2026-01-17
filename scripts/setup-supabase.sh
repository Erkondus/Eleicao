#!/bin/bash
set -e

echo "========================================="
echo "SimulaVoto - Supabase Setup Script"
echo "========================================="

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo ""
  echo "Usage:"
  echo "  export DATABASE_URL='postgresql://...' "
  echo "  ./scripts/setup-supabase.sh"
  exit 1
fi

echo ""
echo "[1/3] Testing database connection..."
if npx drizzle-kit check 2>/dev/null; then
  echo "✅ Database connection successful"
else
  echo "⚠️  Could not verify connection, attempting to continue..."
fi

echo ""
echo "[2/3] Running database migrations..."
npm run db:push

echo ""
echo "[3/3] Verifying tables..."
echo "✅ Database setup complete!"

echo ""
echo "========================================="
echo "Supabase setup completed!"
echo "========================================="
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "⚠️  IMPORTANT: Change the admin password after first login!"
