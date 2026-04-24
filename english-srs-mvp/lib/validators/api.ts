import { z } from 'zod';

export const createSubmissionSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export const reviewSchema = z.object({
  cardId: z.string().uuid(),
  rating: z.number().int().min(0).max(5),
  responseMs: z.number().int().min(0).optional(),
});

export const feedbackSchema = z.object({
  type: z.enum(['not_useful', 'duplicate', 'too_easy', 'too_hard', 'wrong']),
  note: z.string().trim().max(500).optional(),
});

export const issueSchema = z.object({
  errorText: z.string().min(1),
  correctedText: z.string().min(1),
  category: z.enum([
    'grammar',
    'collocation',
    'word_form',
    'article',
    'preposition',
    'tense',
    'word_order',
    'style',
  ]),
  subcategory: z.string().nullable(),
  explanationShort: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  severity: z.number().int().min(1).max(5),
  teachability: z.number().int().min(1).max(5),
  shouldCreateCard: z.boolean(),
});

export const analysisResultSchema = z.object({
  correctedText: z.string().min(1),
  summary: z.string().max(500).nullable(),
  issues: z.array(issueSchema).max(20),
});

export const cardCandidateSchema = z.object({
  cardType: z.enum(['correction', 'cloze', 'choice', 'usage']),
  front: z.string().min(1).max(300),
  back: z.string().min(1).max(300),
  hint: z.string().max(200).optional(),
  example: z.string().max(300).optional(),
  priority: z.number().int().min(1).max(100),
});

export const cardCandidatesSchema = z.object({
  candidates: z.array(cardCandidateSchema).max(3),
});
