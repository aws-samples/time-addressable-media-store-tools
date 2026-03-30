#!/usr/bin/env node

/**
 * Generate TypeScript types from the TAMS OpenAPI specification
 *
 * Usage:
 *   npm run generate-types [version]
 *   npm run generate-types 8.0
 *
 * If no version is provided, defaults to 'main' branch
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = process.argv[2] || 'main';
const outputPath = path.resolve(__dirname, '../src/types/tams.generated.ts');
const sourceUrl = `https://raw.githubusercontent.com/bbc/tams/refs/tags/${version}/api/TimeAddressableMediaStore.yaml`;

console.log(`Generating TAMS types from version: ${version}`);
console.log(`Source: ${sourceUrl}`);
console.log(`Output: ${outputPath}`);

try {
  const { stdout, stderr } = await execAsync(
    `npx openapi-typescript "${sourceUrl}" -o "${outputPath}"`
  );

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  console.log('\n✅ Types generated successfully!');
  console.log(`📄 File: ${outputPath}`);
} catch (error) {
  console.error('\n❌ Error generating types:');
  console.error(error.message);
  process.exit(1);
}
