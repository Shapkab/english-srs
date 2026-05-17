-- Unbounded numeric is wasteful for fixed-range values and accepts
-- pathological 0.99999999999... rounding. Tighten to match intent.

alter table public.analysis_issues
  alter column confidence type numeric(4,3);

alter table public.srs_state
  alter column ease_factor type numeric(4,2);
