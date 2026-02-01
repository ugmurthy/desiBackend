# execute-goal.sh

A shell script to create and execute a DAG (Directed Acyclic Graph) from a goal configuration file using the desiBackend API.

## Prerequisites

- **jq**: A lightweight and flexible command-line JSON processor. Install it using:
  - macOS: `brew install jq`
  - Linux: `sudo apt-get install jq` or `sudo yum install jq`
- **curl**: Usually pre-installed on most systems
- **desiBackend API**: The backend service must be running
- **API Token**: A valid API token for authentication

## Setup

1. **Set the API base URL** (optional, defaults to `http://localhost:3000`):
   ```bash
   export DESI_BACKEND_URL=http://localhost:3000
   ```

2. **Set your API token** (required):
   ```bash
   export DESI_API_TOKEN=your-api-token-here
   ```

## Usage

```bash
./execute-goal.sh -f <filename>
```

### Options

- `-f <filename>`: Path to the goal configuration JSON file (required)

## Goal Configuration File Format

The goal configuration file must be a valid JSON file with the following structure:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `goalText` | string | The goal or objective to achieve |
| `agentName` | string | The name of the agent to use for execution |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string | LLM provider: `"openai"`, `"openrouter"`, or `"ollama"` |
| `model` | string | Model name (e.g., `"gpt-4"`, `"gpt-4o-mini"`) |
| `temperature` | number | Temperature for generation (0.0 - 2.0) |
| `maxTokens` | number | Maximum tokens to generate |
| `seed` | number | Random seed for reproducibility |
| `cronSchedule` | string | Cron schedule for recurring execution |
| `scheduleActive` | boolean | Whether the schedule is active |
| `timezone` | string | Timezone for scheduled execution |

## Example

### 1. Create a goal configuration file

Create a file named `my-goal.json`:

```json
{
  "goalText": "Analyze quarterly sales data and generate insights report",
  "agentName": "data-analyst",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 4096,
  "seed": 42
}
```

### 2. Run the script

```bash
./execute-goal.sh -f my-goal.json
```

### 3. Expected Output

```
Reading goal configuration from: my-goal.json

Creating DAG from goal...
Goal: Analyze quarterly sales data and generate insights report
Agent: data-analyst

✓ DAG created successfully
DAG ID: dag_EbvukFKKz6P4CveL-_sj_

Executing DAG...

✓ DAG execution started successfully
Execution ID: exec_EbvukFKKz6P4CveL-_sj_
Status: pending

You can monitor the execution using:
  curl -H "Authorization: Bearer $DESI_API_TOKEN" "http://localhost:3000/api/v2/executions/exec_EbvukFKKz6P4CveL-_sj_"
```

## Monitoring Execution

After starting the execution, you can monitor its progress using the provided curl command or by checking the execution status:

```bash
curl -H "Authorization: Bearer $DESI_API_TOKEN" "$DESI_BACKEND_URL/api/v2/executions/<execution-id>"
```

To get detailed execution information including sub-steps:

```bash
curl -H "Authorization: Bearer $DESI_API_TOKEN" "$DESI_BACKEND_URL/api/v2/executions/<execution-id>/details"
```

## Error Handling

The script handles various error scenarios:

- **Missing filename**: Shows usage instructions
- **File not found**: Reports the missing file
- **Invalid JSON**: Validates the configuration file format
- **Missing required fields**: Checks for `goalText` and `agentName`
- **Authentication errors**: Reports invalid or missing API token
- **Agent not found**: Reports if the specified agent doesn't exist
- **API errors**: Reports HTTP errors with descriptive messages

## Clarification Required

If the AI agent needs clarification before creating the DAG, the script will display the clarification query and exit:

```
Clarification required from user:
Please specify the date range for the analysis

Please provide clarification and try again.
```

In this case, update your goal configuration with the additional details and run the script again.

## Advanced Examples

### Minimal Configuration

```json
{
  "goalText": "Create a simple hello world program",
  "agentName": "developer"
}
```

### Scheduled Execution

```json
{
  "goalText": "Generate weekly sales report",
  "agentName": "data-analyst",
  "cronSchedule": "0 9 * * 1",
  "scheduleActive": true,
  "timezone": "America/New_York"
}
```

### Using Different Providers

```json
{
  "goalText": "Analyze customer feedback",
  "agentName": "analyst",
  "provider": "openrouter",
  "model": "anthropic/claude-3-opus"
}
```

## Troubleshooting

### Script not executable

```bash
chmod +x execute-goal.sh
```

### jq not found

Install jq using your package manager:
- macOS: `brew install jq`
- Ubuntu/Debian: `sudo apt-get install jq`
- CentOS/RHEL: `sudo yum install jq`

### Connection refused

Ensure the desiBackend service is running:
```bash
# Check if the service is running
curl http://localhost:3000/api/v2/health
```

### Unauthorized error

Verify your API token is correct and set:
```bash
echo $DESI_API_TOKEN
```

## License

This script is part of the desiBackend project.