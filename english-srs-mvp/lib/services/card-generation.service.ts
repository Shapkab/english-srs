import { getOpenAIClient } from '@/lib/openai/client';
import { CARD_GENERATION_SYSTEM_PROMPT, buildCardGenerationUserPrompt } from '@/lib/openai/prompts';
import { cardCandidatesJsonSchema } from '@/lib/openai/schemas';
import { cardCandidatesSchema } from '@/lib/validators/api';
import { log } from '@/lib/observability/log';
import type { CardCandidate } from '@/lib/types/domain';

export async function generateCardCandidates(input: {
  learningTargetTitle: string;
  category: string;
  explanationShort: string;
  sourceSentence: string;
}): Promise<CardCandidate[]> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL_CARD_GENERATION ?? 'gpt-4.1-mini';
  const startedAt = Date.now();

  try {
    const response = await client.responses.create({
      model,
      input: [
        { role: 'system', content: CARD_GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: buildCardGenerationUserPrompt(input) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: cardCandidatesJsonSchema.name,
          strict: true,
          schema: cardCandidatesJsonSchema.schema,
        },
      },
    });

    log.info('ai_call', {
      stage: 'card_generation',
      model,
      latencyMs: Date.now() - startedAt,
      attemptCount: 1,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
    });

    const rawText = response.output_text;
    const parsed = JSON.parse(rawText) as unknown;
    return cardCandidatesSchema.parse(parsed).candidates;
  } catch (error) {
    const err = error as Error;
    log.error('ai_call_failed', {
      stage: 'card_generation',
      model,
      latencyMs: Date.now() - startedAt,
      attemptCount: 1,
      errorName: err?.constructor?.name,
      message: err?.message,
    });
    throw error;
  }
}
