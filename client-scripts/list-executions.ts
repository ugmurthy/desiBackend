#!/usr/bin/env bun
/**
 * execute-goal-sdk.ts - Script to create and execute a DAG using desiClientSDK
 * Usage: bun run execute-goal-sdk.ts [--raw <mode>] [--id <executionId>] [--steps]
 */

import { ApiClient } from '../desiClient';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';

const rawArgIndex = process.argv.indexOf('--raw');
const isRaw = rawArgIndex !== -1;
const rawMode = isRaw ? process.argv[rawArgIndex + 1] : undefined;
const idArgIndex = process.argv.indexOf('--id');
const byId = idArgIndex !== -1;
const executionId = byId ? process.argv[idArgIndex + 1] : undefined;
const bySubSteps = process.argv.includes('--steps');
if (isRaw && !rawMode) {
  console.error('Error: --raw requires a mode argument');
  console.error('Usage: bun run execute-goal-sdk.ts [--raw <mode>] [--id <executionId>] [--steps]');
  process.exit(1);
}
if (byId && !executionId) {
  console.error('Error: --id requires an executionId argument');
  console.error('Usage: bun run execute-goal-sdk.ts [--raw <mode>] [--id <executionId>] [--steps]');
  process.exit(1);
}
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
  const {executions} = await client.executions.list({})
  console.error(`Got ${executions.length} executions`)
  if (isRaw) {
    if (byId) {
      console.error("Raw - mode")
      const execution0 = executions[0]
      const execution = await client.executions.getById({id: executionId || execution0.id});

      if (bySubSteps) {
        console.error("Raw - mode - substeps")
        // list all substeps
        const {subSteps} = await client.executions.getSubSteps({id: executionId || execution0.id})
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
  for (const execution of executions) {
    console.log(chalk.yellow(`Objective: ${execution.primaryIntent}`))
    console.log(chalk.dim(`${execution.id}, ${execution.dagId}`))
    const {subSteps} = await client.executions.getSubSteps({id:execution.id})
    for (const step of subSteps) {
      console.log(chalk.green(`╰─${step.taskId} : ${step.status} ${step.toolOrPromptName}`));
      console.log(chalk.green(` ╰─Relies on result of: ${step.dependencies}`));
      console.log(chalk.blue (`  ╰─(Thought)${step.thought}`));
      console.log(chalk.magenta(`  ╰─(Action)${step.description}`));
    }  

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
