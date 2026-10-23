-- Up Migration
-- Traçabilité des décisions (ADR-DOMAIN-002 accepted) : auteur et date
-- toujours enregistrés, motif obligatoire au rejet, facultatif à
-- l'approbation. Notes déjà décidées : champs à NULL (« décision
-- antérieure à la traçabilité »).
ALTER TABLE expense_notes
  ADD COLUMN decided_by uuid REFERENCES users(id),
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decision_reason text
    -- Garde-fou cohérent avec validerMotif (revues phase/4) : le domaine
    -- rogne à 500 caractères, la base refuse tout dépassement résiduel.
    CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 500);
-- Rejet toujours motivé (revue phase/4 §7) : NOT VALID pour ne pas
-- rejouer les lignes antérieures à la traçabilité (motif NULL sur des
-- notes déjà décidées) — toute nouvelle décision rejetée exige un motif.
ALTER TABLE expense_notes
  ADD CONSTRAINT decision_rejet_motive
  CHECK (status <> 'rejected' OR decision_reason IS NOT NULL)
  NOT VALID;

-- Down Migration
ALTER TABLE expense_notes
  DROP CONSTRAINT IF EXISTS decision_rejet_motive;
ALTER TABLE expense_notes
  DROP COLUMN decision_reason,
  DROP COLUMN decided_at,
  DROP COLUMN decided_by;
