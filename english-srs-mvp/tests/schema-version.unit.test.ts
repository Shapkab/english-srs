import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_SCHEMA_VERSION,
  computeSchemaVersion,
} from '@/lib/openai/schema-version';
import { ANALYSIS_SYSTEM_PROMPT } from '@/lib/openai/prompts';
import { analysisJsonSchema } from '@/lib/openai/schemas';

describe('ANALYSIS_SCHEMA_VERSION', () => {
  it('is a 12-char lowercase hex string', () => {
    expect(ANALYSIS_SCHEMA_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic — recomputing over the same inputs yields the same value', () => {
    expect(
      computeSchemaVersion(ANALYSIS_SYSTEM_PROMPT, JSON.stringify(analysisJsonSchema)),
    ).toBe(ANALYSIS_SCHEMA_VERSION);
  });

  it('changes when the prompt changes', () => {
    const tweaked = `${ANALYSIS_SYSTEM_PROMPT} (extra trailing note)`;
    expect(
      computeSchemaVersion(tweaked, JSON.stringify(analysisJsonSchema)),
    ).not.toBe(ANALYSIS_SCHEMA_VERSION);
  });

  it('changes when the schema changes', () => {
    const tweaked = { ...(analysisJsonSchema as Record<string, unknown>), $extra: true };
    expect(
      computeSchemaVersion(ANALYSIS_SYSTEM_PROMPT, JSON.stringify(tweaked)),
    ).not.toBe(ANALYSIS_SCHEMA_VERSION);
  });

  it('the " " separator prevents trivial prompt/schema substring swaps from colliding', () => {
    // Move the last character of the prompt to the start of the JSON-encoded
    // schema. Without the separator, sha256(promptA + schemaA) ==
    // sha256(promptB + schemaB) where the concatenations are identical.
    const promptLast = ANALYSIS_SYSTEM_PROMPT.slice(-1);
    const promptTrunc = ANALYSIS_SYSTEM_PROMPT.slice(0, -1);
    const schemaShifted = promptLast + JSON.stringify(analysisJsonSchema);
    expect(computeSchemaVersion(promptTrunc, schemaShifted)).not.toBe(
      ANALYSIS_SCHEMA_VERSION,
    );
  });
});
