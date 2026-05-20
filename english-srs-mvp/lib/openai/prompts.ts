export const ANALYSIS_SYSTEM_PROMPT = `You are an English correction and learning-target extraction engine.

Your job:
1. Correct the user's English.
2. Extract each distinct issue.
3. Classify each issue.
4. Give a short explanation.
5. Score confidence, severity, and teachability.
6. Recommend whether the issue is worth turning into a study card.

Rules:
- Focus on practical, everyday English.
- Ignore punctuation-only issues.
- Ignore obvious one-off typos unless the issue changes meaning.
- Explanations must be short and direct.
- Return only the required structured output.`;

const MAX_USER_TEXT_LENGTH = 10_000;

function sanitizeUserText(text: string): string {
  return text
    .slice(0, MAX_USER_TEXT_LENGTH)
    .replace(/```/g, '\\`\\`\\`')
    .replace(/<\/?[a-z_]+>/gi, (match) => `\\${match}`);
}

export function buildAnalysisUserPrompt(text: string): string {
  const sanitized = sanitizeUserText(text);
  return `Analyze this English text for learning purposes:
<user_text>
${sanitized}
</user_text>
Respond only with the structured JSON output.`;
}

export const CARD_GENERATION_SYSTEM_PROMPT = `You generate high-value spaced-repetition card candidates.

Your job:
1. Use the normalized learning target and source example.
2. Generate up to 3 concise card candidates.
3. Prioritize everyday English and user-specific mistakes.
4. Avoid duplicates and low-value trivia.

Rules:
- Keep fronts and backs short.
- Make cards answerable.
- Prefer correction, cloze, and choice cards.
- Return only the required structured output.`;

export function buildCardGenerationUserPrompt(input: {
  learningTargetTitle: string;
  category: string;
  explanationShort: string;
  sourceSentence: string;
}): string {
  const sanitized = sanitizeUserText(input.sourceSentence);
  return `Create review cards for this learning target:
Title: ${input.learningTargetTitle}
Category: ${input.category}
Explanation: ${input.explanationShort}
<source_sentence>
${sanitized}
</source_sentence>`;
}
