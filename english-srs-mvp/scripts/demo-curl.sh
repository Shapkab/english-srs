#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
AUTH_TOKEN=${AUTH_TOKEN:-}
AUTH_HEADER=()

if [[ -n "$AUTH_TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $AUTH_TOKEN")
fi

curl -X POST "$BASE_URL/api/v1/submissions" \
  -H "Content-Type: application/json" \
  "${AUTH_HEADER[@]}" \
  -d '{"text":"I did mistake when I writed to him yesterday."}'

echo

curl "$BASE_URL/api/v1/review-queue" \
  "${AUTH_HEADER[@]}"
