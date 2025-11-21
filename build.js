/**
 * Build Script for L-Banner Player
 * 
 * This script bundles, minifies, and obfuscates the L-Banner player code.
 * It:
 * 1. Bundles all JavaScript files into a single IIFE bundle
 * 2. Minifies the code for production
 * 3. Obfuscates the code to protect intellectual property
 * 4. Copies CSS file to dist directory
 * 
 * Output files:
 * - dist/lbanner-player.min.js (bundled, minified, obfuscated JavaScript)
 * - dist/lbanner-player.min.css (CSS stylesheet)
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Ensure dist directory exists before building
 */
mkdirSync('dist', { recursive: true });

/**
 * Build JavaScript bundle using esbuild
 * Bundles all imports from lbanner-entry.js into a single IIFE file
 * - bundle: true - Includes all dependencies in output
 * - minify: true - Minifies code for smaller file size
 * - format: 'iife' - Wraps code in Immediately Invoked Function Expression
 * - platform: 'browser' - Targets browser environment
 * - target: 'es2015' - Compiles to ES2015 for compatibility
 */
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

/**
 * Obfuscate the bundled JavaScript code
 * Applies multiple obfuscation techniques to protect code:
 * - Control flow flattening: Makes code execution flow harder to follow
 * - Dead code injection: Adds fake code paths to confuse reverse engineers
 * - String array encoding: Encodes strings in base64 and stores in array
 * - Identifier name mangling: Renames variables to hexadecimal names
 * - Number obfuscation: Converts numbers to expressions
 */
const jsOutputPath = 'dist/lbanner-player.min.js';
const originalBundle = readFileSync(jsOutputPath, 'utf-8');
const obfuscationResult = JavaScriptObfuscator.obfuscate(originalBundle, {
  compact: true, // Remove whitespace
  controlFlowFlattening: true, // Flatten control flow
  controlFlowFlatteningThreshold: 0.8, // 80% of nodes flattened
  deadCodeInjection: true, // Inject dead code
  deadCodeInjectionThreshold: 0.4, // 40% of nodes get dead code
  disableConsoleOutput: false, // Keep console.log for debugging
  identifierNamesGenerator: 'hexadecimal', // Use hex names for variables
  numbersToExpressions: true, // Convert numbers to expressions
  simplify: true, // Simplify code after obfuscation
  splitStrings: true, // Split strings into chunks
  splitStringsChunkLength: 5, // Chunk size for string splitting
  stringArray: true, // Store strings in array
  stringArrayEncoding: ['base64'], // Encode strings as base64
  stringArrayThreshold: 0.75, // 75% of strings go to array
  transformObjectKeys: true, // Obfuscate object keys
});
writeFileSync(jsOutputPath, obfuscationResult.toString());

/**
 * Copy CSS file to dist directory
 * CSS is not bundled/minified, just copied as-is
 */
const cssContent = readFileSync('styles.css', 'utf-8');
writeFileSync('dist/lbanner-player.min.css', cssContent);

console.log('✓ Build complete!');
console.log('  - dist/lbanner-player.min.js');
console.log('  - dist/lbanner-player.min.css');

