-- Up Migration
-- Index des chemins chauds (phase 8) : historique personnel, listes
-- des valideurs (I7, I8, ADR-ARCH-002) et rattachements. Aucun
-- changement de comportement : les requêtes existantes deviennent des
-- parcours d'index au lieu de scans complets.
CREATE INDEX IF NOT EXISTS expense_notes_user_status_created_idx
  ON expense_notes (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS expense_notes_status_created_idx
  ON expense_notes (status, created_at ASC);

CREATE INDEX IF NOT EXISTS users_manager_idx
  ON users (manager_id)
  WHERE manager_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_company_role_idx
  ON users (company_id, role);

-- Down Migration
DROP INDEX IF EXISTS users_company_role_idx;
DROP INDEX IF EXISTS users_manager_idx;
DROP INDEX IF EXISTS expense_notes_status_created_idx;
DROP INDEX IF EXISTS expense_notes_user_status_created_idx;
