export const analysisJsonSchema = {
  name: 'analysis_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      correctedText: { type: 'string' },
      summary: { type: ['string', 'null'] },
      issues: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            errorText: { type: 'string' },
            correctedText: { type: 'string' },
            category: {
              type: 'string',
              enum: ['grammar', 'collocation', 'word_form', 'article', 'preposition', 'tense', 'word_order', 'style'],
            },
            subcategory: { type: ['string', 'null'] },
            explanationShort: { type: 'string' },
            confidence: { type: 'number' },
            severity: { type: 'integer' },
            teachability: { type: 'integer' },
            shouldCreateCard: { type: 'boolean' },
          },
          required: ['errorText', 'correctedText', 'category', 'subcategory', 'explanationShort', 'confidence', 'severity', 'teachability', 'shouldCreateCard'],
        },
      },
    },
    required: ['correctedText', 'summary', 'issues'],
  },
} as const;

export const cardCandidatesJsonSchema = {
  name: 'card_candidates',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cardType: { type: 'string', enum: ['correction', 'cloze', 'choice', 'usage'] },
            front: { type: 'string' },
            back: { type: 'string' },
            hint: { type: 'string' },
            example: { type: 'string' },
            priority: { type: 'integer' },
          },
          required: ['cardType', 'front', 'back', 'hint', 'example', 'priority'],
        },
      },
    },
    required: ['candidates'],
  },
} as const;
