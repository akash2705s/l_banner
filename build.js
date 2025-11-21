import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure dist directory exists
mkdirSync('dist', { recursive: true });

// Build JavaScript bundle
await build({
  entryPoints: ['build/lbanner-entry.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  sourcemap: false,
  outfile: 'dist/lbanner-player.min.js',
  platform: 'browser',
  target: 'es2015',
  logLevel: 'info',
});

const jsOutputPath = 'dist/lbanner-player.min.js';
const originalBundle = readFileSync(jsOutputPath, 'utf-8');
const obfuscationResult = JavaScriptObfuscator.obfuscate(originalBundle, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.8,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
});
writeFileSync(jsOutputPath, obfuscationResult.toString());

// Extract and build CSS separately
const cssContent = readFileSync('styles.css', 'utf-8');
writeFileSync('dist/lbanner-player.min.css', cssContent);

console.log('✓ Build complete!');
console.log('  - dist/lbanner-player.min.js');
console.log('  - dist/lbanner-player.min.css');

