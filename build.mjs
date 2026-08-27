import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  legalComments: 'external',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/sandbox-cli.ts'],
    outfile: 'dist/sandbox-cli.mjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/sandbox-mcp.ts'],
    outfile: 'dist/sandbox-mcp.mjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/save-agent-result.ts'],
    outfile: 'dist/save-agent-result.mjs',
  }),
]);
