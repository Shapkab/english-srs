#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
USER_ID=${USER_ID:-11111111-1111-1111-1111-111111111111}

curl -X POST "$BASE_URL/api/v1/submissions" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"text":"I did mistake when I writed to him yesterday."}'

echo

curl "$BASE_URL/api/v1/review-queue" \
  -H "x-user-id: $USER_ID"
