export type LinkKind = 'created' | 'promoted' | 'merged';

export interface LinkKindInput {
  firstSeenAt: string;
  submissionCreatedAt: string;
  seenCount: number;
}

// Classify the relationship between an analysis issue and its
// learning target.
//
//   - 'created'  : the LT was born during this submission's analysis
//                  (firstSeenAt >= submissionCreatedAt).
//   - 'merged'   : the LT predates this submission and has accumulated
//                  multiple sightings (seenCount > 1) -- the issue
//                  merged into an existing pattern.
//   - 'promoted' : the LT predates the submission but this is the only
//                  sighting so far.
//
// Returns null when the input is missing (the route passes null to
// indicate "no LT linked").
export function computeLinkKind(input: LinkKindInput | null | undefined): LinkKind | null {
  if (!input) return null;
  const isNew = input.firstSeenAt >= input.submissionCreatedAt;
  if (isNew) return 'created';
  if (input.seenCount > 1) return 'merged';
  return 'promoted';
}
