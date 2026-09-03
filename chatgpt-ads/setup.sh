#!/usr/bin/env bash
# Setup script for ChatGPT Ads — installs dependencies and builds the project.
set -euo pipefail

cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install

echo "Building project..."
npm run build

echo ""
echo "Setup complete! No API keys required."
echo "  - Run locally:   npm run dev"
echo "  - Deploy:        vercel --prod"
