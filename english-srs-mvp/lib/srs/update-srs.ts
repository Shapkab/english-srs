export interface SrsStateInput {
  repetition: number;
  intervalDays: number;
  easeFactor: number;
  lapseCount: number;
}

export interface SrsStateOutput extends SrsStateInput {
  dueAt: string;
  lastReviewedAt: string;
}

export function updateSrsState(state: SrsStateInput, rating: number): SrsStateOutput {
  let { repetition, intervalDays, easeFactor, lapseCount } = state;

  if (rating < 3) {
    repetition = 0;
    intervalDays = 1;
    lapseCount += 1;
  } else {
    if (repetition === 0) intervalDays = 1;
    else if (repetition === 1) intervalDays = 3;
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));

    repetition += 1;
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)),
    );
  }

  const now = new Date();
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return {
    repetition,
    intervalDays,
    easeFactor,
    lapseCount,
    dueAt: dueAt.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}
