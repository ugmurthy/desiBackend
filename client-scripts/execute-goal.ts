#!/usr/bin/env bun
/**
 * execute-goal-sdk.ts - Script to create and execute a DAG using desiClientSDK
 * Usage: bun run execute-goal-sdk.ts -f <filename>
 */

import { ApiClient } from '../desiClient';

import { resolve } from 'path';
import { parseArgs } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';

// Check if API token is set
if (!API_TOKEN) {
  console.error('Error: DESI_API_TOKEN environment variable is not set');
  console.error('Please set it using: export DESI_API_TOKEN=<your-api-token>');
  process.exit(1);
}


async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

function usage() {
  console.log(`
Usage: bun run examples/execute-goal.ts [options]

Options:
  -f, --file <filename>  Read goal from file
  -s, --skill <skill>    Use specified skill
  -h, --help             Show this help message
`);
}

function getSkillContent(skillName: string): string {
  const skillPath = join(homedir(), '.config', 'amp', 'skills', skillName, 'SKILL.md');
  if (!existsSync(skillPath)) {
    console.error(`Skill not found: ${skillPath}`);
    process.exit(1);
  }
  return readFileSync(skillPath, 'utf-8').trim();
}

async function getGoal(): Promise<string> {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        file: { type: 'string', short: 'f' },
        skill: { type: 'string', short: 's' },
        help: { type: 'boolean', short: 'h' },
      },
    });

    let goal: string;

    if (values.help) {
      usage();
      process.exit(0);
    }

    if (values.file) {
      goal = readFileSync(values.file, 'utf-8').trim();
    } else if (!process.stdin.isTTY) {
      goal = await readStdin();
    } else {
      console.log('No goal provided. Use -f <filename> or pipe input via stdin.');
      usage();
      process.exit(1);
    }

    if (values.skill) {
      const skillContent = getSkillContent(values.skill);
      goal = skillContent + '\n' + goal;
    }
    if (goal.length <= 10) {
      console.log('Goal is too short. Please provide a more detailed goal.');
      usage();
      process.exit(1);  
    }
    return goal;
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    usage();
    process.exit(1);
  }
}

async function main() {
  const goal = await getGoal();
  console.log('Goal:', goal.slice(0, 100) + (goal.length > 100 ? '...' : ''));

  // Initialize the API client
const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
});

  try {
    console.log('Creating DAG from goal...\n');
    const createResult = await client.dags.create({body:{
      goalText: goal,
      agentName: 'DecomposerV8',
      temperature: 0.7,
    }});

    if (createResult.status !== 'success' || !('dagId' in createResult)) {
      console.log('DAG creation did not return a dagId:', createResult.status);
      if (createResult.status === 'clarification_required') {
        console.log('Clarification needed:', createResult.clarificationQuery);
      } else {
        console.log('Error:', createResult.status);
      }
      return;
    }

    const dagId = createResult.dagId;
    console.log('DAG created with ID:', dagId);

    // Execute the DAG
    console.log('\nExecuting DAG...');
    let executionId 
    try {

       const execution = await client.dags.execute({id:dagId as string,body:{}});
       executionId = execution.id
      console.log('Execution started!');
      console.log('  Execution ID:', execution);
      
      //Wait for execution to complete - use fetch for real-time streaming
      const eventsUrl = `${API_BASE_URL}/api/v2/executions/${executionId}/events`;
      const response = await fetch(eventsUrl, {
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
      });
      
      if (!response.body) throw new Error('No response body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              console.log('Type:', event.type);
              console.log('Data:', JSON.stringify(event.data, null, 2));
              console.log('---');
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }


    } catch (err) {
      console.log('Error executing DAG:', err);
      process.exit(1);
    }
    
    
    
    

    // Get execution details with substeps
    
    //console.log(`final result: \n ${executionDetails.finalResult}\n`)
    //if (executionDetails.subSteps && executionDetails.subSteps.length > 0) {
    //  console.log('\nSubSteps:');
    //  for (const step of executionDetails.subSteps) {
    //    console.log(`- Task ${step.taskId}: ${step.toolOrPromptName} ${step.status}, ${parseFloat(step.durationMs/1000).toFixed(2)}s}`);
    //  }
    //}


  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('Done!');
  }
}

main();
