-- Revoke direct call surface from authenticated; both RPCs are internal-only.
-- We also revoke from public because Postgres grants EXECUTE on functions to
-- PUBLIC by default and authenticated inherits from PUBLIC, so revoking only
-- from authenticated would leave the surface open via the default PUBLIC grant.
revoke execute on function public.record_review(
  uuid, uuid, int, int, int, int, numeric, int, timestamptz, timestamptz
) from authenticated;

revoke execute on function public.record_review(
  uuid, uuid, int, int, int, int, numeric, int, timestamptz, timestamptz
) from public;

revoke execute on function public.persist_submission_analysis(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) from authenticated;

revoke execute on function public.persist_submission_analysis(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) from public;
