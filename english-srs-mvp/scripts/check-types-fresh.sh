#!/usr/bin/env bash
# T8: block commits that stage a new migration without also re-generating
# english-srs-mvp/lib/types/database.generated.ts. Pass --no-verify on the
# commit if the omission is intentional.
set -euo pipefail

staged_files=$(git diff --cached --name-only)

# Did this commit touch a migration?
if printf '%s\n' "$staged_files" | grep -q '^english-srs-mvp/supabase/migrations/'; then
  if ! printf '%s\n' "$staged_files" | grep -qx 'english-srs-mvp/lib/types/database.generated.ts'; then
    cat >&2 <<'MSG'
Migration staged without regenerating database.generated.ts. Run
`npm run db:types` (or `db:types:remote`) and stage the result, or
`git commit --no-verify` if intentional.
MSG
    exit 1
  fi
fi

exit 0
