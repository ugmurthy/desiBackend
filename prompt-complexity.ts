#!/usr/bin/env bun

import { ApiClient } from './desiClient';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { InputAnalyzer } from './input-analyser.ts';
import {EnhancedInputAnalyzer} from './enhanced-input-analyzer.ts'
// Default values
const API_BASE_URL = process.env.DESI_BACKEND_URL || 'http://localhost:3000';
const API_TOKEN = process.env.DESI_API_TOKEN || '';


// Initialize the API client
const client = new ApiClient({
  baseUrl: API_BASE_URL,
  token: API_TOKEN,
});

const inputAnalyzer = new InputAnalyzer();
const enhancedInputAnalyzer = new EnhancedInputAnalyzer();
try {
  // Create the DAG
  const dags = await client.dags.list({limit:50});
  console.log(`Found ${dags.dags.length} Dags:`)
  let displayDag 
  for (const dag of dags.dags) {
    const d = await client.dags.getById({id: dag.id});
    displayDag=d
    
    if (dag.status === 'success') {
      
      const complexityScore = await inputAnalyzer.analyzeComplexity(d.metadata.goalText)
      const eScore = await enhancedInputAnalyzer.analyzeComplexity(d.metadata.goalText) ;
      //console.log("\t",complexityScore) 
      
     
      
      if (eScore.isComplex) {
        console.log("\n")
        console.log("\t",d.metadata.goalText.substring(0,100))
        console.log(`- (${dag.id}) ${dag.status}  }`);
        console.log("\t",d.metadata.goalText.length, "chars", d.metadata.result.sub_tasks.length," tasks");
        console.log(enhancedInputAnalyzer.getReadableAnalysis(eScore));
        
        console.log("==================")
      }    
      
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
        console.error(`Error: page not found`);
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
