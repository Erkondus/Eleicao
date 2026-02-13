#!/bin/bash
set -e

echo "========================================="
echo "SimulaVoto - Production Build Script"
echo "========================================="

echo ""
echo "[1/4] Installing dependencies..."
npm ci

echo ""
echo "[2/4] Type checking..."
npm run check

echo ""
echo "[3/4] Building application..."
npm run build

echo ""
echo "[4/4] Verifying build..."
if [ -f "dist/index.cjs" ]; then
  echo "✅ Build successful! Output: dist/index.cjs"
else
  echo "❌ Build failed: dist/index.cjs not found"
  exit 1
fi

echo ""
echo "========================================="
echo "Build completed successfully!"
echo "========================================="
echo ""
echo "To run the production server:"
echo "  NODE_ENV=production npm start"
echo ""
echo "Or with Docker Compose:"
echo "  docker compose up -d --build"
