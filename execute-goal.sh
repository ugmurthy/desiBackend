#!/bin/bash

# execute-goal.sh - Script to create and execute a DAG from a goal configuration file
# Usage: ./execute-goal.sh -f <filename>

set -e

# Default values
API_BASE_URL="${DESI_BACKEND_URL:-http://localhost:3000}"
API_TOKEN="${DESI_API_TOKEN:-}"

# Parse command line arguments
while getopts "f:" opt; do
  case $opt in
    f)
      FILENAME="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      echo "Usage: $0 -f <filename>" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

# Check if filename is provided
if [ -z "$FILENAME" ]; then
  echo "Error: Filename is required" >&2
  echo "Usage: $0 -f <filename>" >&2
  exit 1
fi

# Check if file exists
if [ ! -f "$FILENAME" ]; then
  echo "Error: File '$FILENAME' not found" >&2
  exit 1
fi

# Check if API token is set
if [ -z "$API_TOKEN" ]; then
  echo "Error: DESI_API_TOKEN environment variable is not set" >&2
  echo "Please set it using: export DESI_API_TOKEN=<your-api-token>" >&2
  exit 1
fi

# Read the goal configuration file
echo "Reading goal configuration from: $FILENAME"
GOAL_CONFIG=$(cat "$FILENAME")

# Validate JSON
if ! echo "$GOAL_CONFIG" | jq empty > /dev/null 2>&1; then
  echo "Error: File '$FILENAME' does not contain valid JSON" >&2
  exit 1
fi

# Extract required fields
GOAL_TEXT=$(echo "$GOAL_CONFIG" | jq -r '.goalText // empty')
AGENT_NAME=$(echo "$GOAL_CONFIG" | jq -r '.agentName // empty')

# Validate required fields
if [ -z "$GOAL_TEXT" ] || [ "$GOAL_TEXT" = "null" ]; then
  echo "Error: 'goalText' is required in the configuration file" >&2
  exit 1
fi

if [ -z "$AGENT_NAME" ] || [ "$AGENT_NAME" = "null" ]; then
  echo "Error: 'agentName' is required in the configuration file" >&2
  exit 1
fi

# Extract optional fields
PROVIDER=$(echo "$GOAL_CONFIG" | jq -r '.provider // empty')
MODEL=$(echo "$GOAL_CONFIG" | jq -r '.model // empty')
TEMPERATURE=$(echo "$GOAL_CONFIG" | jq -r '.temperature // empty')
MAX_TOKENS=$(echo "$GOAL_CONFIG" | jq -r '.maxTokens // empty')
SEED=$(echo "$GOAL_CONFIG" | jq -r '.seed // empty')
CRON_SCHEDULE=$(echo "$GOAL_CONFIG" | jq -r '.cronSchedule // empty')
SCHEDULE_ACTIVE=$(echo "$GOAL_CONFIG" | jq -r '.scheduleActive // empty')
TIMEZONE=$(echo "$GOAL_CONFIG" | jq -r '.timezone // empty')

# Build the request body
REQUEST_BODY=$(jq -n \
  --arg goalText "$GOAL_TEXT" \
  --arg agentName "$AGENT_NAME" \
  --arg provider "$PROVIDER" \
  --arg model "$MODEL" \
  --arg temperature "$TEMPERATURE" \
  --arg maxTokens "$MAX_TOKENS" \
  --arg seed "$SEED" \
  --arg cronSchedule "$CRON_SCHEDULE" \
  --arg scheduleActive "$SCHEDULE_ACTIVE" \
  --arg timezone "$TIMEZONE" \
  '{
    goalText: $goalText,
    agentName: $agentName
  } + (
    if $provider != "" and $provider != "null" then {provider: $provider} else {} end
  ) + (
    if $model != "" and $model != "null" then {model: $model} else {} end
  ) + (
    if $temperature != "" and $temperature != "null" then {temperature: $temperature} else {} end
  ) + (
    if $maxTokens != "" and $maxTokens != "null" then {maxTokens: $maxTokens} else {} end
  ) + (
    if $seed != "" and $seed != "null" then {seed: $seed} else {} end
  ) + (
    if $cronSchedule != "" and $cronSchedule != "null" then {cronSchedule: $cronSchedule} else {} end
  ) + (
    if $scheduleActive != "" and $scheduleActive != "null" then {scheduleActive: $scheduleActive} else {} end
  ) + (
    if $timezone != "" and $timezone != "null" then {timezone: $timezone} else {} end
  )')

echo ""
echo "Creating DAG from goal..."
echo "Goal: $GOAL_TEXT"
echo "Agent: $AGENT_NAME"
echo ""

# Create the DAG
CREATE_RESPONSE=$(curl -s -X POST \
  "$API_BASE_URL/api/v2/dags" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$REQUEST_BODY")

# Check for errors in response
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$API_BASE_URL/api/v2/dags" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$REQUEST_BODY")

if [ "$HTTP_CODE" -eq 401 ]; then
  echo "Error: Unauthorized - Invalid or missing API token" >&2
  exit 1
fi

if [ "$HTTP_CODE" -eq 404 ]; then
  echo "Error: Agent '$AGENT_NAME' not found" >&2
  exit 1
fi

if [ "$HTTP_CODE" -eq 400 ]; then
  echo "Error: Bad Request - $(echo "$CREATE_RESPONSE" | jq -r '.message // .error // "Unknown error"')" >&2
  exit 1
fi

if [ "$HTTP_CODE" -ne 201 ] && [ "$HTTP_CODE" -ne 202 ]; then
  echo "Error: Failed to create DAG (HTTP $HTTP_CODE)" >&2
  echo "Response: $CREATE_RESPONSE" >&2
  exit 1
fi

# Check if clarification is required
STATUS=$(echo "$CREATE_RESPONSE" | jq -r '.status // empty')

if [ "$STATUS" = "clarification_required" ]; then
  echo "Clarification required from user:"
  echo "$(echo "$CREATE_RESPONSE" | jq -r '.clarificationQuery')"
  echo ""
  echo "Please provide clarification and try again."
  exit 0
fi

# Extract DAG ID
DAG_ID=$(echo "$CREATE_RESPONSE" | jq -r '.dagId // .id // empty')

if [ -z "$DAG_ID" ] || [ "$DAG_ID" = "null" ]; then
  echo "Error: Failed to extract DAG ID from response" >&2
  echo "Response: $CREATE_RESPONSE" >&2
  exit 1
fi

echo "✓ DAG created successfully"
echo "DAG ID: $DAG_ID"
echo ""

# Build execute request body (optional provider and model)
EXECUTE_BODY=$(jq -n \
  --arg provider "$PROVIDER" \
  --arg model "$MODEL" \
  '{
    provider: ($provider | if . != "" and . != "null" then . else null end),
    model: ($model | if . != "" and . != "null" then . else null end)
  } | with_entries(select(.value != null))')

echo "Executing DAG..."
echo ""

# Execute the DAG
EXECUTE_RESPONSE=$(curl -s -X POST \
  "$API_BASE_URL/api/v2/dags/$DAG_ID/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$EXECUTE_BODY")

# Check for errors in execution
EXECUTE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$API_BASE_URL/api/v2/dags/$DAG_ID/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$EXECUTE_BODY")

if [ "$EXECUTE_HTTP_CODE" -eq 401 ]; then
  echo "Error: Unauthorized - Invalid or missing API token" >&2
  exit 1
fi

if [ "$EXECUTE_HTTP_CODE" -eq 404 ]; then
  echo "Error: DAG '$DAG_ID' not found" >&2
  exit 1
fi

if [ "$EXECUTE_HTTP_CODE" -ne 202 ]; then
  echo "Error: Failed to execute DAG (HTTP $EXECUTE_HTTP_CODE)" >&2
  echo "Response: $EXECUTE_RESPONSE" >&2
  exit 1
fi

# Extract execution ID
EXECUTION_ID=$(echo "$EXECUTE_RESPONSE" | jq -r '.id // empty')
EXECUTION_STATUS=$(echo "$EXECUTE_RESPONSE" | jq -r '.status // empty')

echo "✓ DAG execution started successfully"
echo "Execution ID: $EXECUTION_ID"
echo "Status: $EXECUTION_STATUS"
echo ""
echo "You can monitor the execution using:"
echo "  curl -H \"Authorization: Bearer \$DESI_API_TOKEN\" \"$API_BASE_URL/api/v2/executions/$EXECUTION_ID\""
