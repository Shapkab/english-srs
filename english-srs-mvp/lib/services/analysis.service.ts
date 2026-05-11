import { getOpenAIClient } from '@/lib/openai/client';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/openai/prompts';
import { analysisJsonSchema } from '@/lib/openai/schemas';
import { analysisResultSchema } from '@/lib/validators/api';
import { log } from '@/lib/observability/log';
import type { AnalysisResultDTO } from '@/lib/types/domain';

export async function analyzeSubmissionText(text: string): Promise<AnalysisResultDTO> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL_ANALYSIS ?? 'gpt-4.1-mini';
  const startedAt = Date.now();

  try {
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: buildAnalysisUserPrompt(text) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: analysisJsonSchema.name,
          strict: true,
          schema: analysisJsonSchema.schema,
        },
      },
    });

    log.info('ai_call', {
      stage: 'analysis',
      model,
      latencyMs: Date.now() - startedAt,
      attemptCount: 1,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
    });

    const rawText = response.output_text;
    const parsed = JSON.parse(rawText) as unknown;
    return analysisResultSchema.parse(parsed);
  } catch (error) {
    const err = error as Error;
    log.error('ai_call_failed', {
      stage: 'analysis',
      model,
      latencyMs: Date.now() - startedAt,
      attemptCount: 1,
      errorName: err?.constructor?.name,
      message: err?.message,
    });
    throw error;
  }
}
