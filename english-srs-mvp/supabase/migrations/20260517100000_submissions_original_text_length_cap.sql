-- Cap submissions.original_text at the same length the route-handler Zod
-- guard enforces (createSubmissionSchema in lib/validators/api.ts). Closes
-- the direct-admin-insert / future-migration-script DoS vector — without
-- this, a bug in any service-role caller can write a 1MB string and the
-- OpenAI bill follows.

alter table public.submissions
  add constraint submissions_original_text_length_chk
    check (char_length(original_text) <= 10000);
