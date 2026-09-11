-- Lets a trip's day (and its Proposals pseudo-day, date IS NULL) carry an
-- explicit map color instead of always deriving one from sort_order
-- position. Null means "not set yet" — the client falls back to the old
-- index-based/Proposals-blue default for such rows (pre-existing trips).
alter table days add column color text;
