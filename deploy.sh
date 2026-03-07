#!/bin/bash
set -e

COMPOSE_FILE="${1:-docker-compose.supabase.yml}"

echo "=== SimulaVoto Deploy ==="
echo "Compose file: $COMPOSE_FILE"
echo ""

echo "Bumping version..."
node -e "
const fs = require('fs');
const versionPath = 'version.json';
const data = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
if (!Array.isArray(data.changelog)) data.changelog = [];
const today = new Date().toISOString().split('T')[0];
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const [major, minor, patch] = data.version.split('.').map(Number);
const newVersion = major + '.' + minor + '.' + (patch + 1);

const sameDayEntry = data.changelog[0];
if (sameDayEntry && sameDayEntry.date === today) {
  sameDayEntry.changes.push('Build ' + now);
  console.log('Same-day build appended to changelog ' + sameDayEntry.version);
} else {
  data.changelog.unshift({
    version: newVersion,
    date: today,
    changes: ['Build automático ' + newVersion + ' (' + now + ')'],
  });
}

data.version = newVersion;
data.buildDate = today;
fs.writeFileSync(versionPath, JSON.stringify(data, null, 2) + '\n');
console.log('Version: ' + newVersion + ' (buildDate: ' + today + ')');
"

echo ""
echo "Building and deploying..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo ""
echo "Deploy complete!"
echo "Check logs: docker compose -f $COMPOSE_FILE logs -f simulavoto"
