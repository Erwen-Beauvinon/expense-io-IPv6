-- Up Migration
-- Policies alignées sur les valideurs ADR-ARCH-002 (revue phase/8 §2,
-- ADR-DATA-002) : manager direct, N+1, RH des cas lignes 2-3 — toujours
-- dans la même entreprise. Translitération exacte du WHERE de
-- `trancherSiEnAttente` (src/adapters/PgExpenseNoteRepository.ts) :
-- auteur et valideur même entreprise, valideur = direct (manager),
-- ou N+1 (manager au-dessus d'un direct manager), ou RH de
-- l'entreprise quand l'auteur est RH, sans manager, ou rattaché hors
-- ligne managériale. Remplacent les policies manager/hr de 0001/0003.
DROP POLICY IF EXISTS expense_notes_manager_select ON expense_notes;
DROP POLICY IF EXISTS expense_notes_manager_update ON expense_notes;
DROP POLICY IF EXISTS expense_notes_hr_root_manager_select ON expense_notes;
DROP POLICY IF EXISTS expense_notes_hr_root_manager_update ON expense_notes;

-- Auteur courant (hors périmètre applicatif) : le contexte RLS.
-- NULL (hors scope) ou entreprise absente : comparaisons à NULL,
-- donc aucune ligne (échec fermé).
-- uid : utilisateur courant ; entreprise : la sienne.
CREATE POLICY expense_notes_valideurs_select ON expense_notes
  FOR SELECT
  USING (
    expense_notes.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    OR (
      EXISTS (
        SELECT 1 FROM users auteur
        WHERE auteur.id = expense_notes.user_id
          AND auteur.company_id = (
            SELECT company_id FROM users
            WHERE id = nullif(current_setting('app.current_user_id', true), '')::uuid
          )
      )
      AND (
        -- Manager direct (manager uniquement).
        EXISTS (
          SELECT 1 FROM users auteur
          JOIN users direct ON direct.id = auteur.manager_id
          WHERE auteur.id = expense_notes.user_id
            AND direct.role = 'manager'
            AND direct.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        )
        -- N+1 : manager au-dessus d'un direct manager.
        OR EXISTS (
          SELECT 1 FROM users auteur
          JOIN users direct ON direct.id = auteur.manager_id
          JOIN users superieur ON superieur.id = direct.manager_id
          WHERE auteur.id = expense_notes.user_id
            AND direct.role = 'manager'
            AND superieur.id = nullif(current_setting('app.current_user_id', true), '')::uuid
            AND superieur.role = 'manager'
        )
        -- RH de l'entreprise : auteur RH, sans manager, ou rattaché
        -- hors ligne managériale (chaîne non managériale).
        OR (
          EXISTS (
            SELECT 1 FROM users moi
            WHERE moi.id = nullif(current_setting('app.current_user_id', true), '')::uuid
              AND moi.role = 'hr_admin'
          )
          AND (
            EXISTS (
              SELECT 1 FROM users auteur
              WHERE auteur.id = expense_notes.user_id
                AND auteur.role = 'hr_admin'
            )
            OR EXISTS (
              SELECT 1 FROM users auteur
              WHERE auteur.id = expense_notes.user_id
                AND auteur.manager_id IS NULL
            )
            OR NOT EXISTS (
              SELECT 1 FROM users auteur
              JOIN users m ON m.id = auteur.manager_id
              WHERE auteur.id = expense_notes.user_id
                AND m.role = 'manager'
                AND m.manager_id IS NOT NULL
            )
          )
        )
      )
    )
  );

-- Écriture : même règle, sans jamais soi-même (I7 — le WHERE
-- applicatif porte aussi `en.user_id <> acteur`).
CREATE POLICY expense_notes_valideurs_update ON expense_notes
  FOR UPDATE
  USING (
    expense_notes.user_id <> nullif(current_setting('app.current_user_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM users auteur
        WHERE auteur.id = expense_notes.user_id
          AND auteur.company_id = (
            SELECT company_id FROM users
            WHERE id = nullif(current_setting('app.current_user_id', true), '')::uuid
          )
      )
      AND (
        EXISTS (
          SELECT 1 FROM users auteur
          JOIN users direct ON direct.id = auteur.manager_id
          WHERE auteur.id = expense_notes.user_id
            AND direct.role = 'manager'
            AND direct.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        )
        OR EXISTS (
          SELECT 1 FROM users auteur
          JOIN users direct ON direct.id = auteur.manager_id
          JOIN users superieur ON superieur.id = direct.manager_id
          WHERE auteur.id = expense_notes.user_id
            AND direct.role = 'manager'
            AND superieur.id = nullif(current_setting('app.current_user_id', true), '')::uuid
            AND superieur.role = 'manager'
        )
        OR (
          EXISTS (
            SELECT 1 FROM users moi
            WHERE moi.id = nullif(current_setting('app.current_user_id', true), '')::uuid
              AND moi.role = 'hr_admin'
          )
          AND (
            EXISTS (
              SELECT 1 FROM users auteur
              WHERE auteur.id = expense_notes.user_id
                AND auteur.role = 'hr_admin'
            )
            OR EXISTS (
              SELECT 1 FROM users auteur
              WHERE auteur.id = expense_notes.user_id
                AND auteur.manager_id IS NULL
            )
            OR NOT EXISTS (
              SELECT 1 FROM users auteur
              JOIN users m ON m.id = auteur.manager_id
              WHERE auteur.id = expense_notes.user_id
                AND m.role = 'manager'
                AND m.manager_id IS NOT NULL
            )
          )
        )
      )
    )
  );

-- Down Migration
DROP POLICY IF EXISTS expense_notes_valideurs_update ON expense_notes;
DROP POLICY IF EXISTS expense_notes_valideurs_select ON expense_notes;

CREATE POLICY expense_notes_hr_root_manager_select ON expense_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.role = 'manager'
        AND u.manager_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM users hr
      WHERE hr.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND hr.role = 'hr_admin'
        AND hr.company_id = (
          SELECT company_id FROM users WHERE id = expense_notes.user_id
        )
    )
  );

CREATE POLICY expense_notes_hr_root_manager_update ON expense_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.role = 'manager'
        AND u.manager_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM users hr
      WHERE hr.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND hr.role = 'hr_admin'
        AND hr.company_id = (
          SELECT company_id FROM users WHERE id = expense_notes.user_id
        )
    )
  );

CREATE POLICY expense_notes_manager_select ON expense_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.company_id = (
          SELECT company_id FROM users
          WHERE id = nullif(current_setting('app.current_user_id', true), '')::uuid
        )
    )
  );

CREATE POLICY expense_notes_manager_update ON expense_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.company_id = (
          SELECT company_id FROM users
          WHERE id = nullif(current_setting('app.current_user_id', true), '')::uuid
        )
    )
  );
