-- Preserve prior history but mark its incomplete provenance as incompatible.
-- New runs record a reviewed fingerprint covering model, corpus, grader,
-- inference settings, and shared system instructions.
ALTER TABLE runs ADD COLUMN experiment_version TEXT NOT NULL DEFAULT '';
