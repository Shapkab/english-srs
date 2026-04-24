import { z } from 'zod';
import { getOpenAIClient } from '@/lib/openai/client';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/openai/prompts';
import { analysisJsonSchema } from '@/lib/openai/schemas';
import { analysisResultSchema } from '@/lib/validators/api';
import type { AnalysisResultDTO } from '@/lib/types/domain';

export async function analyzeSubmissionText(text: string): Promise<AnalysisResultDTO> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL_ANALYSIS ?? 'gpt-4.1-mini';

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

  const rawText = response.output_text;
  const parsed = JSON.parse(rawText) as unknown;
  return analysisResultSchema.parse(parsed);
}

export function safeParseAnalysis(raw: unknown): AnalysisResultDTO | null {
  const result = analysisResultSchema.safeParse(raw);
  return result.success ? result.data : null;
}
