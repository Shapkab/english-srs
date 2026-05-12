-- Bind card_feedback rows to (card_id, user_id) tuples in cards, so a user
-- cannot insert feedback claiming another user's card_id. The previous FK on
-- card_id alone, combined with RLS gating only on user_id = auth.uid(),
-- allowed cross-user pollution; the composite FK closes this at the DB layer.

-- 1. Add the unique key on cards (id, user_id) that the composite FK requires.
alter table public.cards
  add constraint cards_id_user_id_key unique (id, user_id);

-- 2. Drop the existing single-column FK on card_feedback.card_id.
alter table public.card_feedback
  drop constraint card_feedback_card_id_fkey;

-- 3. Add the composite FK.
alter table public.card_feedback
  add constraint card_feedback_card_id_user_id_fkey
    foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade;
