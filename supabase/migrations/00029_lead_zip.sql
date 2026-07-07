-- Zip code on leads — enables the equity dashboard's funnel disaggregation
-- by neighborhood (who is the funnel reaching, and who is it losing).
ALTER TABLE lead
  ADD COLUMN zip TEXT;
