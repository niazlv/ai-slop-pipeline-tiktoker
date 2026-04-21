#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Fix relative imports without .js extension
  const fixedContent = content.replace(
    /from\s+['"](\.[^'"]*?)['"];?/g,
    (match, importPath) => {
      if (!importPath.endsWith('.js') && !importPath.includes('.json')) {
        return match.replace(importPath, importPath + '.js');
      }
      return match;
    }
  );
  
  if (content !== fixedContent) {
    fs.writeFileSync(filePath, fixedContent);
    console.log(`Fixed: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js')) {
      fixImportsInFile(filePath);
    }
  }
}

const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  console.log('Fixing imports in dist/...');
  walkDir(distDir);
  console.log('Done!');
} else {
  console.log('dist/ directory not found');
}