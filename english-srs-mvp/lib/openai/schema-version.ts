import { createHash } from 'node:crypto';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts';
import { analysisJsonSchema } from './schemas';

// 12-char prefix of sha256 over the two contract surfaces. Bumps
// automatically when the prompt text or the JSON Schema shape changes,
// so analyses.schema_version becomes a real fingerprint instead of a
// hardcoded literal that drifts silently.
export const ANALYSIS_SCHEMA_VERSION: string = createHash('sha256')
  .update(ANALYSIS_SYSTEM_PROMPT)
  .update(' ')
  .update(JSON.stringify(analysisJsonSchema))
  .digest('hex')
  .slice(0, 12);
