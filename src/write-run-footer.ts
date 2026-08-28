#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { formatRunFooter, isRunMetadata } from './run-metadata.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const metadataPath = requiredEnvironment('METADATA_PATH');
const outputPath = requiredEnvironment('OUTPUT_PATH');
const source: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));
const runMetadata =
  typeof source === 'object' && source !== null && 'runMetadata' in source
    ? source.runMetadata
    : undefined;

if (!isRunMetadata(runMetadata)) {
  throw new Error('The artifact does not contain valid run metadata.');
}

await writeFile(outputPath, formatRunFooter(runMetadata, requiredEnvironment('RUN_URL')));
