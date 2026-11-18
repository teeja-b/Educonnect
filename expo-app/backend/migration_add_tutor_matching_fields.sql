-- Apply once to the existing SQLite database before deploying the updated app.py.
-- Back up educonnect.db first. SQLite supports ADD COLUMN for these nullable fields.
ALTER TABLE tutor_profile ADD COLUMN teaching_levels TEXT;
ALTER TABLE tutor_profile ADD COLUMN exam_boards TEXT;
ALTER TABLE tutor_profile ADD COLUMN price_currency VARCHAR(3);
ALTER TABLE tutor_profile ADD COLUMN modality VARCHAR(20);
ALTER TABLE tutor_profile ADD COLUMN location VARCHAR(120);
