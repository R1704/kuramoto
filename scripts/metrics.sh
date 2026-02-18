#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
find src -name '*.js' -print0 | xargs -0 wc -l | sort -nr | head -n 30
