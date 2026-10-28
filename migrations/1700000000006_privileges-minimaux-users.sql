-- Up Migration
-- Privilèges de expense_app resserrés (revue V2, point 5) :
-- 1. `users` : SELECT par colonnes, SANS password_hash. Une faille de
--    lecture applicative n'expose plus les hachages de toutes les
--    entreprises. L'authentification passe par une fonction
--    SECURITY DEFINER dédiée, seule voie d'accès au hash.
-- 2. Privilèges par défaut : les tables futures ne reçoivent plus
--    UPDATE sur toutes les colonnes (contradiction avec les GRANT
--    par colonnes de 0003) — SELECT, INSERT seulement, tout UPDATE
--    devra être accordé explicitement, colonne par colonne.
REVOKE SELECT ON users FROM expense_app;
GRANT SELECT (id, company_id, name, email, role, manager_id, created_at)
  ON users TO expense_app;

CREATE OR REPLACE FUNCTION authentifier_par_email(p_email text)
RETURNS TABLE (id uuid, email text, password_hash text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.password_hash, u.role
  FROM users u
  WHERE u.email = p_email
$$;
REVOKE ALL ON FUNCTION authentifier_par_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authentifier_par_email(text) TO expense_app;

DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     REVOKE UPDATE ON TABLES FROM expense_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     GRANT SELECT, INSERT ON TABLES TO expense_app',
    current_user
  );
END
$$;

-- Down Migration
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     REVOKE SELECT, INSERT ON TABLES FROM expense_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE ON TABLES TO expense_app',
    current_user
  );
END
$$;

DROP FUNCTION IF EXISTS authentifier_par_email(text);
REVOKE SELECT (id, company_id, name, email, role, manager_id, created_at)
  ON users FROM expense_app;
GRANT SELECT ON users TO expense_app;
