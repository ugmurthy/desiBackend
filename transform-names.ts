import * as fs from 'fs';

interface OperationMap {
  [key: string]: string;
}

interface TransformedOperation {
  service: string;
  method: string;
}

interface InputJson {
  operations: OperationMap;
}

interface OutputJson {
  operations: Record<string, TransformedOperation>;
}

/**
 * Splits a camelCase string into parts based on uppercase letter boundaries.
 * Examples:
 *   "getApiV2AuthMe"          → ["get", "Api", "V2", "Auth", "Me"]
 *   "deleteApiV2AuthApiKeysById" → ["delete", "Api", "V2", "Auth", "Api", "Keys", "By", "Id"]
 */
function splitCamelCase(key: string): string[] {
  return key.split(/(?=[A-Z])/);
}

/**
 * Transforms the operations object according to the specified rules:
 * - Index 3 of the split parts becomes "service" (lower-cased)
 * - "method" is parts[0] + joined parts[4..end] (preserving original casing)
 * - Indices 1 and 2 ("Api" and "V2") are ignored
 */
function transformOperations(operations: OperationMap): Record<string, TransformedOperation> {
  const result: Record<string, TransformedOperation> = {};

  for (const key of Object.keys(operations)) {
    const parts = splitCamelCase(key);
    
    if (parts.length < 5) {
      //console.warn(`Key "${key}" does not have enough parts after splitting (expected at least 5, got ${parts.length}): ${parts.join(', ')}`);
      parts.push("--")
    }

    const service = parts[3].toLowerCase();
    const method = parts[0] + parts.slice(4).join('');

    result[key] = { service, method };
  }

  return result;
}

/**
 * Main script: reads JSON from stdin, transforms it, writes pretty-printed JSON to stdout.
 * Usage example:
 *   cat input.json | npx ts-node this-script.ts > output.json
 *   node dist/this-script.js < input.json > output.json
 */
function main() {
  let inputJson: string;
  try {
    inputJson = fs.readFileSync(process.stdin.fd, 'utf-8');
  } catch (err) {
    console.error('Failed to read input from stdin');
    process.exit(1);
  }

  let data: InputJson;
  try {
    data = JSON.parse(inputJson);
  } catch (err) {
    console.error('Invalid JSON input');
    process.exit(1);
  }

  if (!data.operations || typeof data.operations !== 'object') {
    console.error('Input JSON must contain an "operations" object');
    process.exit(1);
  }

  const transformedOperations = transformOperations(data.operations);

  const output: OutputJson = {
    operations: transformedOperations,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();