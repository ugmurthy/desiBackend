#!/usr/bin/env bun
/**
 * execute-goal-sdk.ts - Script to create and execute a DAG using desiClientSDK
 * Usage: bun run execute-goal-sdk.ts -f <filename>
 */

import { ApiClient } from '../desiClient';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';



// Check if API token is set
if (!API_TOKEN) {
  console.error('Error: DESI_API_TOKEN environment variable is not set');
  console.error('Please set it using: export DESI_API_TOKEN=<your-api-token>');
  process.exit(1);
}

// Initialize the API client
const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
});


try {
  // Create the DAG
  const createResponse = await client.agents.list({})
  console.log(JSON.stringify(createResponse));
  
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
