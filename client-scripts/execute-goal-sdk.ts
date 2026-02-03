#!/usr/bin/env bun
/**
 * execute-goal-sdk.ts - Script to create and execute a DAG using desiClientSDK
 * Usage: bun run execute-goal-sdk.ts -f <filename>
 */

import { ApiClient } from './desiClient';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';

// Parse command line arguments
const args = process.argv.slice(2);
let filename = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-f' && i + 1 < args.length) {
    filename = args[i + 1];
    i++;
  }
}

// Check if filename is provided
if (!filename) {
  console.error('Error: Filename is required');
  console.error('Usage: bun run execute-goal-sdk.ts -f <filename>');
  process.exit(1);
}

// Resolve file path
const filePath = resolve(filename);

// Check if file exists
try {
  readFileSync(filePath);
} catch (error) {
  console.error(`Error: File '${filename}' not found`);
  process.exit(1);
}

// Check if API token is set
if (!API_TOKEN) {
  console.error('Error: DESI_API_TOKEN environment variable is not set');
  console.error('Please set it using: export DESI_API_TOKEN=<your-api-token>');
  process.exit(1);
}

// Read and parse the goal configuration file
console.log(`Reading goal configuration from: ${filename}`);
let goalConfig: Record<string, unknown>;
try {
  const fileContent = readFileSync(filePath, 'utf-8');
  goalConfig = JSON.parse(fileContent);
} catch (error) {
  console.error(`Error: Failed to parse JSON from file '${filename}'`);
  console.error(error);
  process.exit(1);
}

// Validate required fields
const goalText = goalConfig.goalText as string | undefined;
const agentName = goalConfig.agentName as string | undefined;

if (!goalText || typeof goalText !== 'string') {
  console.error("Error: 'goalText' is required in the configuration file");
  process.exit(1);
}

if (!agentName || typeof agentName !== 'string') {
  console.error("Error: 'agentName' is required in the configuration file");
  process.exit(1);
}

// Extract optional fields
const provider = goalConfig.provider as string | undefined;
const model = goalConfig.model as string | undefined;
const temperature = goalConfig.temperature as number | undefined;
const maxTokens = goalConfig.maxTokens as number | undefined;
const seed = goalConfig.seed as number | undefined;
const cronSchedule = goalConfig.cronSchedule as string | undefined;
const scheduleActive = goalConfig.scheduleActive as boolean | undefined;
const timezone = goalConfig.timezone as string | undefined;

// Build the request body
const requestBody: Record<string, unknown> = {
  goalText,
  agentName,
};

if (provider && provider !== 'null') {
  requestBody.provider = provider;
}
if (model && model !== 'null') {
  requestBody.model = model;
}
if (temperature !== undefined && temperature !== null) {
  requestBody.temperature = temperature;
}
if (maxTokens !== undefined && maxTokens !== null) {
  requestBody.maxTokens = maxTokens;
}
if (seed !== undefined && seed !== null) {
  requestBody.seed = seed;
}
if (cronSchedule && cronSchedule !== 'null') {
  requestBody.cronSchedule = cronSchedule;
}
if (scheduleActive !== undefined && scheduleActive !== null) {
  requestBody.scheduleActive = scheduleActive;
}
if (timezone && timezone !== 'null') {
  requestBody.timezone = timezone;
}

console.log('');
console.log('Creating DAG from goal...');
console.log(`Goal: ${goalText}`);
console.log(`Agent: ${agentName}`);
console.log('');

// Initialize the API client
const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
});

try {
  // Create the DAG
  const createResponse = await client.dags.create({
    body: requestBody,
  }) as Record<string, unknown>;

  // Check for clarification required
  const status = createResponse.status as string | undefined;
  if (status === 'clarification_required') {
    console.log('Clarification required from user:');
    console.log(createResponse.clarificationQuery as string);
    console.log('');
    console.log('Please provide clarification and try again.');
    process.exit(0);
  }

  // Extract DAG ID
  const dagId = (createResponse.dagId || createResponse.id) as string | undefined;
  if (!dagId) {
    console.error('Error: Failed to extract DAG ID from response');
    console.error('Response:', JSON.stringify(createResponse, null, 2));
    process.exit(1);
  }

  console.log('✓ DAG created successfully');
  console.log(`DAG ID: ${dagId}`);
  console.log('');

  // Build execute request body (optional provider and model)
  const executeBody: Record<string, unknown> = {};
  if (provider && provider !== 'null') {
    executeBody.provider = provider;
  }
  if (model && model !== 'null') {
    executeBody.model = model;
  }

  console.log('Executing DAG...');
  console.log('');

  // Execute the DAG
  const executeResponse = await client.dags.execute({
    id: dagId,
    body: Object.keys(executeBody).length > 0 ? executeBody : undefined,
  }) as Record<string, unknown>;

  // Extract execution ID
  const executionId = executeResponse.id as string | undefined;
  const executionStatus = executeResponse.status as string | undefined;

  if (!executionId) {
    console.error('Error: Failed to extract execution ID from response');
    console.error('Response:', JSON.stringify(executeResponse, null, 2));
    process.exit(1);
  }

  console.log('✓ DAG execution started successfully');
  console.log(`Execution ID: ${executionId}`);
  console.log(`Status: ${executionStatus}`);
  console.log('');
  console.log('You can monitor the execution using:');
  console.log(`  curl -H "Authorization: Bearer $DESI_API_TOKEN" "${API_BASE_URL}/api/v2/executions/${executionId}"`);

} catch (error) {
  if (error instanceof Error) {
    // Handle axios errors
    if ('response' in error) {
      const axiosError = error as { response?: { status?: number; data?: Record<string, unknown> } };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;

      if (status === 401) {
        console.error('Error: Unauthorized - Invalid or missing API token');
      } else if (status === 404) {
        console.error(`Error: Agent '${agentName}' not found`);
      } else if (status === 400) {
        console.error(`Error: Bad Request - ${data?.message || data?.error || 'Unknown error'}`);
      } else {
        console.error(`Error: Failed to create or execute DAG (HTTP ${status})`);
        console.error('Response:', JSON.stringify(data, null, 2));
      }
    } else {
      console.error('Error:', error.message);
    }
  } else {
    console.error('Error: An unexpected error occurred');
    console.error(error);
  }
  process.exit(1);
}
