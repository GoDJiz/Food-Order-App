-- Enables "reply to a bot order message to update it" (LINE reply/quote
-- feature). LINE's incoming webhook events include an optional
-- `quotedMessageId` on a message that replies to a previous one; to match
-- that against a specific order, we need to remember the LINE message ID
-- of the most recent bot message that displayed that order's full state.
--
-- Nullable, additive only -- no existing column or table is touched.
alter table orders
  add column last_line_message_id text;
