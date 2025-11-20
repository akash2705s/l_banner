import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  sourcemap: true,
  outfile: 'dist/lbanner-player.min.js',
  platform: 'browser',
  target: 'es2015',
  logLevel: 'info',
});

// Extract and build CSS separately
const cssContent = readFileSync('styles.css', 'utf-8');
writeFileSync('dist/lbanner-player.min.css', cssContent);

console.log('✓ Build complete!');
console.log('  - dist/lbanner-player.min.js');
console.log('  - dist/lbanner-player.min.css');

