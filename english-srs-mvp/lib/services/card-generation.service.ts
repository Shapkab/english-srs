import { getOpenAIClient } from '@/lib/openai/client';
import { CARD_GENERATION_SYSTEM_PROMPT, buildCardGenerationUserPrompt } from '@/lib/openai/prompts';
import { cardCandidatesJsonSchema } from '@/lib/openai/schemas';
import { cardCandidatesSchema } from '@/lib/validators/api';
import type { CardCandidate } from '@/lib/types/domain';

export async function generateCardCandidates(input: {
  learningTargetTitle: string;
  category: string;
  explanationShort: string;
  sourceSentence: string;
}): Promise<CardCandidate[]> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL_CARD_GENERATION ?? 'gpt-4.1-mini';

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

  const rawText = response.output_text;
  const parsed = JSON.parse(rawText) as unknown;
  return cardCandidatesSchema.parse(parsed).candidates;
}
