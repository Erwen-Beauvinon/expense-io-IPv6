-- Up Migration
-- Rôle applicatif dédié, non-superutilisateur (ADR-DATA-002 accepted,
-- I10) : l'application se connecte avec ce rôle, soumis à la RLS.
-- SANS login ni mot de passe ici (revue phase/8 §3) : la migration ne
-- crée qu'un rôle NOLOGIN sans secret. Le mot de passe est posé hors
-- migration — développement : `scripts/seed.mjs` (ALTER ROLE,
-- mot de passe de développement uniquement) ; production : secret
-- dédié sous la responsabilité du pilote 2 (données).
-- Les migrations et le seed continuent d'utiliser le compte
-- d'administration (superuser, contourne la RLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_app') THEN
    CREATE ROLE expense_app WITH NOLOGIN;
  END IF;
END
$$;

-- Privilèges minimaux (revue phase/8 §5) : aucun DELETE nulle part,
-- UPDATE restreint aux colonnes écrites par l'application
-- (users.manager_id par Rattacher, colonnes de traçabilité des notes).
GRANT USAGE ON SCHEMA public TO expense_app;
GRANT SELECT, INSERT ON companies TO expense_app;
GRANT SELECT, INSERT ON users TO expense_app;
GRANT UPDATE (manager_id) ON users TO expense_app;
GRANT SELECT, INSERT ON expense_notes TO expense_app;
GRANT UPDATE (status, decided_by, decided_at, decision_reason) ON expense_notes TO expense_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO expense_app;

-- Noms d'environnement non codés en dur (revue phase/8 §5) : base et
-- rôle d'administration résolus dynamiquement (base courante,
-- utilisateur courant = le migrateur, seul créateur futur de tables).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO expense_app', current_database());
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE ON TABLES TO expense_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO expense_app',
    current_user
  );
END
$$;

-- Policies RH : l'égalité d'entreprise manquait (audit A-F10) — un RH
-- de B voyait les notes des managers racines de A. Corrigé ici.
DROP POLICY IF EXISTS expense_notes_hr_root_manager_select ON expense_notes;
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

DROP POLICY IF EXISTS expense_notes_hr_root_manager_update ON expense_notes;
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

-- Policies manager : même entreprise des deux côtés (défense en
-- profondeur, la politique applicative peutConsulter restant première).
DROP POLICY IF EXISTS expense_notes_manager_select ON expense_notes;
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

DROP POLICY IF EXISTS expense_notes_manager_update ON expense_notes;
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

-- Down Migration
DROP POLICY IF EXISTS expense_notes_manager_update ON expense_notes;
CREATE POLICY expense_notes_manager_update ON expense_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS expense_notes_manager_select ON expense_notes;
CREATE POLICY expense_notes_manager_select ON expense_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = expense_notes.user_id
        AND u.manager_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS expense_notes_hr_root_manager_update ON expense_notes;
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
    )
  );

DROP POLICY IF EXISTS expense_notes_hr_root_manager_select ON expense_notes;
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
    )
  );

-- Révocation dynamique, symétrique du Up (rôle et base courants).
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     REVOKE ALL ON TABLES FROM expense_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     REVOKE ALL ON SEQUENCES FROM expense_app',
    current_user
  );
END
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM expense_app;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM expense_app;
REVOKE ALL ON SCHEMA public FROM expense_app;
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM expense_app', current_database());
END
$$;
DROP ROLE IF EXISTS expense_app;
