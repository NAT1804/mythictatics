/**
 * Nx spells its workspace root with a lowercase drive letter on Windows, so `nx test` starts
 * Vitest in `c:\…` where Node's own cwd is `C:\…`. Vite resolves one file under two module ids
 * then, `setupFiles` and the specs land in separate module graphs, and the TestBed that
 * `test-setup.ts` initialises is not the one a spec sees — every Angular test fails with
 * "Need to call TestBed.initTestEnvironment() first". Vitest reads the cwd before it loads a
 * vite config, so the casing has to be put back out here, ahead of its CLI.
 */
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.platform === 'win32') {
  process.chdir(realpathSync.native(process.cwd()));
}

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
await import(pathToFileURL(cli).href);
