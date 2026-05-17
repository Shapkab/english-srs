-- Bind cards rows to (learning_target_id, user_id) tuples in
-- learning_targets so a card cannot reference another user's target.
-- The existing single-column FK on learning_target_id + RLS on user_id
-- = auth.uid() leaves a service-role / admin-script-shaped hole. Same
-- pattern as 20260511121000 fixed for card_feedback.

-- 1. Add the unique key on learning_targets (id, user_id) that the
--    composite FK requires. (cards (id, user_id) already exists.)
alter table public.learning_targets
  add constraint learning_targets_id_user_id_key unique (id, user_id);

-- 2. Drop the existing single-column FK on cards.learning_target_id.
alter table public.cards
  drop constraint cards_learning_target_id_fkey;

-- 3. Add the composite FK.
alter table public.cards
  add constraint cards_learning_target_id_user_id_fkey
    foreign key (learning_target_id, user_id)
    references public.learning_targets (id, user_id)
    on delete cascade;
