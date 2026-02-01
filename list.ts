#!/usr/bin/env bun

import { ApiClient } from './sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';


// Initialize the API client
const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
});

try {
  // Create the DAG
  const dags = await client.dags.list({limit:50});
  console.log(`Found ${dags.dags.length} Dags:`)
  let displayDag 
  for (const dag of dags.dags) {
    const d = await client.dags.getById({id: dag.id});
    displayDag=d
    console.log(`- (${dag.id}) ${dag.status}  }`);
  }

  console.log(displayDag)
  // Try deleting a dag (could fail if it has a execution)
  try {
    const result = await client.dags.deleteById({id: displayDag.id})
    console.log("Dag Deleted")

  } catch (error) {
    console.warn(console.log("Dag not deleted : ", displayDag.id ))
  }
  
  console.log("=============================================")

 const execs = await client.executions.list({limit:50});
 console.log( )
 let displayExec
 console.log(`Found ${execs.executions.length} Executions:`)
 for (const exec of execs.executions) {
  displayExec=exec
  console.log(`- (${exec.id} ${exec.status} dagId: ${exec.dagId} tasks:${exec.totalTasks} )`);
  
  }
console.log(displayExec)
//await client.executions.deleteById({id: displayExec.id})
//console.log("execution Deleted")

const agents = await client.agents.list({limit:50});
console.log( )
console.log(`Found ${agents.agents.length} Agents:`)
for (const agent of agents.agents) {
console.log(`- (${agent.id}) ${agent.name} ${agent.provider} ${agent.model}`);
}

//
///auth
const me = await client.auth.getMe();
console.log("Me: ",me)

/// tools
const tools = await client.tools.list({limit:50});
console.log( )
console.log(`Found ${tools.tools.length} Tools, ${Object.keys(tools.tools[0])}`)
for (const tool of tools.tools) {
console.log(`- (${tool.name }) : ${tool.description}`);
}

const costs_summary = await client.costs.getSummary({})
console.log("Costs summary: ", JSON.stringify(costs_summary,null,2));

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
