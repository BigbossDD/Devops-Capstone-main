#!/bin/bash
# Runs on first postgres container boot. Creates one DB per name in
# POSTGRES_MULTIPLE_DATABASES (comma-separated), all owned by POSTGRES_USER.
set -e

create_db() {
    local db=$1
    echo "Creating database: $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        CREATE DATABASE $db;
        GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
        create_db "$db"
    done
fi
