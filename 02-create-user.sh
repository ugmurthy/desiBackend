#!/bin/bash

EMAIL=$1
NAME=$2
TENANT_NAME=$3
ROLE=${4:-member}

if [ -z "$EMAIL" ] || [ -z "$NAME" ] || [ -z "$TENANT_NAME" ]; then
  echo "Usage: $0 <email> <name> <tenant_name> [role]"
  echo "  role: admin, member (default), viewer"
  exit 1
fi

if [[ ! "$ROLE" =~ ^(admin|member|viewer)$ ]]; then
  echo "Error: Invalid role '$ROLE'. Must be one of: admin, member, viewer"
  exit 1
fi

ADMIN_DB=~/.desiAgent/admin.db

if [ ! -f "$ADMIN_DB" ]; then
  echo "Error: Admin database not found at $ADMIN_DB"
  exit 1
fi

TENANT_ROW=$(sqlite3 "$ADMIN_DB" "SELECT id, slug FROM tenants WHERE name = '$TENANT_NAME' OR slug = '$TENANT_NAME' LIMIT 1;")

if [ -z "$TENANT_ROW" ]; then
  echo "Error: Tenant '$TENANT_NAME' does not exist"
  echo ""
  echo "Available tenants:"
  sqlite3 "$ADMIN_DB" "SELECT name, slug FROM tenants;" | while IFS='|' read -r name slug; do
    echo "  - $name (slug: $slug)"
  done
  exit 1
fi

TENANT_ID=$(echo "$TENANT_ROW" | cut -d'|' -f1)
TENANT_SLUG=$(echo "$TENANT_ROW" | cut -d'|' -f2)

TENANT_DB=~/.desiAgent/tenants/$TENANT_ID/agent.db

if [ ! -f "$TENANT_DB" ]; then
  echo "Error: Tenant database not found at $TENANT_DB"
  exit 1
fi

EXISTING_USER=$(sqlite3 "$TENANT_DB" "SELECT id FROM users WHERE email = '$EMAIL' LIMIT 1;")

if [ -n "$EXISTING_USER" ]; then
  echo "Error: User with email '$EMAIL' already exists in tenant '$TENANT_NAME'"
  exit 1
fi

USER_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
CREATED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")

sqlite3 "$TENANT_DB" "INSERT INTO users (id, email, name, role, tenantId, createdAt, updatedAt) VALUES ('$USER_ID', '$EMAIL', '$NAME', '$ROLE', '$TENANT_ID', '$CREATED_AT', '$CREATED_AT');"

if [ $? -ne 0 ]; then
  echo "Error: Failed to create user"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

API_KEY_RESULT=$(cd "$PROJECT_DIR" && bun run "$SCRIPT_DIR/create-api-key.ts" "$TENANT_DB" "$TENANT_ID" "$USER_ID" "default" 2>&1)

if [ $? -ne 0 ]; then
  echo "Warning: User created but failed to generate API key"
  echo "  Error: $API_KEY_RESULT"
  echo ""
  echo "User created:"
  echo "  ID:     $USER_ID"
  echo "  Email:  $EMAIL"
  echo "  Name:   $NAME"
  echo "  Role:   $ROLE"
  echo "  Tenant: $TENANT_NAME (slug: $TENANT_SLUG)"
  exit 1
fi

FULL_KEY=$(echo "$API_KEY_RESULT" | jq -r '.fullKey')
KEY_PREFIX=$(echo "$API_KEY_RESULT" | jq -r '.keyPrefix')

KEY_FILENAME="${TENANT_NAME}-${NAME}-${ROLE}.txt"
KEY_FILEPATH=~/.desiAgent/$KEY_FILENAME
echo "$FULL_KEY" > "$KEY_FILEPATH"

echo "User created successfully:"
echo "  ID:      $USER_ID"
echo "  Email:   $EMAIL"
echo "  Name:    $NAME"
echo "  Role:    $ROLE"
echo "  Tenant:  $TENANT_NAME (slug: $TENANT_SLUG)"
echo ""
echo "API Key (saved to $KEY_FILEPATH):"
echo "  $FULL_KEY"
