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

const isRaw = process.argv.includes('--raw');
const byId = process.argv.includes('--id');
const bySubSteps = process.argv.includes('--steps');
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
const exec_id = 'exec_9nAj3qoKaK2YykQ2VTTXj'
try {
  // Create the DAG
  const {executions} = await client.executions.list({})
  console.error(`Got ${executions.length} executions`)
  if (isRaw) {
    if (byId) {
      console.error("Raw - mode")
      const execution0 = executions[0]
      const execution = await client.executions.getById({id:exec_id || execution0.id});

      if (bySubSteps) {
        console.error("Raw - mode - substeps")
        // list all substeps
        const {subSteps} = await client.executions.getSubSteps({id:exec_id || execution0.id})
        for (const step of subSteps ) {
          console.error(step.id, Object.keys(step))
          console.log(step.result) 
        }
      } else {
        // just output one
        console.error("One execution detail") 
        console.log(JSON.stringify(execution))
      }      
    } else {
      console.error("Listing all executions")
      console.log(JSON.stringify(executions));
    }
    process.exit(0);
  }
  console.log('Executions:')
  
  //console.log(JSON.stringify(createResponse));
  for (const execution of createResponse.executions) {
    console.log(`${execution.id}, ${execution.dagId}, ${execution.primaryIntent}`)
     const {subSteps} = await client.executions.getSubSteps({id:execution.id})
     //console.log('Substeps:',JSON.stringify(Object.keys(subSteps[0])) );
     
     const details= client.executions.getByIdDetails({id:execution.id})
      console.log('details:',JSON.stringify(details)) ;

     //console.log('')

  }
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
        console.error(`Error: status code: ${status}`);
      } else if (status === 400) {
        console.error(`Error: Bad Request - ${data?.message || data?.error || 'Unknown error'}`);
      } else {
        console.error(`Error: Failed to create or execute DAG (HTTP ${status})`);
        //console.error('Response:', JSON.stringify(data, null, 2));
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
