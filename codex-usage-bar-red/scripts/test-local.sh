#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
mkdir -p .build/local-tests
swiftc Sources/CodexUsageBar/UsageModels.swift \
  Sources/CodexUsageBar/UsageClient.swift \
  Sources/CodexUsageBar/Localization.swift \
  Tests/ClientFixtureTests.swift Tests/main.swift \
  -o .build/local-tests/usage-tests
.build/local-tests/usage-tests
