import { createHash } from 'node:crypto';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts';
import { analysisJsonSchema } from './schemas';

// Pure helper, exported so tests can exercise it with synthetic inputs
// without duplicating the hash logic. The single-space separator stops
// the trivial collision where content moves between the prompt tail
// and the JSON-schema head: with the separator, the space lands at a
// position determined by the prompt length, so any cross-boundary swap
// changes the byte stream.
export function computeSchemaVersion(prompt: string, schemaJson: string): string {
  return createHash('sha256')
    .update(prompt)
    .update(' ')
    .update(schemaJson)
    .digest('hex')
    .slice(0, 12);
}

// 12-char prefix of sha256 over the two contract surfaces. Bumps
// automatically when the prompt text or the JSON Schema shape changes,
// so analyses.schema_version becomes a real fingerprint instead of a
// hardcoded literal that drifts silently.
export const ANALYSIS_SCHEMA_VERSION: string = computeSchemaVersion(
  ANALYSIS_SYSTEM_PROMPT,
  JSON.stringify(analysisJsonSchema),
);
