-- Make lottery_rule_set_id nullable on lottery_run since not all runs require a rule set.
ALTER TABLE lottery_run ALTER COLUMN lottery_rule_set_id DROP NOT NULL;
