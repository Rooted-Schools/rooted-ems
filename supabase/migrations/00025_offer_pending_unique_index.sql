-- Prevent concurrent sendOffer from creating two pending offers for the same application.
-- Only one offer per application can be in 'pending' status at a time.
CREATE UNIQUE INDEX IF NOT EXISTS offer_application_pending_unique
  ON offer (application_id)
  WHERE status = 'pending';
