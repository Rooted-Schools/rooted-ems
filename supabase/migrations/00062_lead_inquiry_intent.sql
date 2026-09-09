-- ============================================
-- Interest-list intent
-- ============================================
--
-- The public interest-list / inquiry form now asks "What are you interested
-- in?" as a required question so the recruitment team knows whether a family
-- means to apply as soon as the window opens or is still exploring. Stored on
-- the lead alongside pathway_interest.
--
-- CHECK keeps it to the known set (or NULL for leads created before this
-- existed, and for the sheet-sync path which does not collect it).

ALTER TABLE lead
  ADD COLUMN IF NOT EXISTS inquiry_intent TEXT
  CHECK (inquiry_intent IS NULL OR inquiry_intent IN ('apply_when_open', 'learn_more'));

COMMENT ON COLUMN lead.inquiry_intent IS
  'Family''s answer to "What are you interested in?" on the interest-list form: apply_when_open or learn_more. NULL for leads created before this field or imported from the lead sheet.';
