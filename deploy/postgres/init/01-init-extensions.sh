#!/usr/bin/env sh
set -eu

# Enable Arabic trigram search extension and create least-privilege runtime role for SouqAlGhanam 2.0
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${SOUQ_APP_DB_USER:-souq_app}') THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', '${SOUQ_APP_DB_USER:-souq_app}', '${SOUQ_APP_DB_PASSWORD}');
    END IF;
  END
  \$\$;

  GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${SOUQ_APP_DB_USER:-souq_app}";
  GRANT USAGE ON SCHEMA public TO "${SOUQ_APP_DB_USER:-souq_app}";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${SOUQ_APP_DB_USER:-souq_app}";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${SOUQ_APP_DB_USER:-souq_app}";
EOSQL
