const fs = require('node:fs');
const path = require('node:path');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const INDEX_FILE = path.join(__dirname, '..', 'src', 'index.js');
const OPENAPI_FILE = path.join(__dirname, '..', '..', 'openapi.yaml');

function normalizePath(routePath) {
  return routePath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

function collectRouteOperations() {
  const operations = new Set();
  const routeFiles = fs.readdirSync(ROUTES_DIR).filter((file) => file.endsWith('.js'));

  for (const file of routeFiles) {
    const fullPath = path.join(ROUTES_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const regex = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(content))) {
      operations.add(`${match[1].toUpperCase()} ${normalizePath(match[2])}`);
    }
  }

  const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
  const indexRegex = /apiRouter\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  let indexMatch;

  while ((indexMatch = indexRegex.exec(indexContent))) {
    operations.add(`${indexMatch[1].toUpperCase()} ${normalizePath(indexMatch[2])}`);
  }

  return operations;
}

function collectOpenApiOperations() {
  const content = fs.readFileSync(OPENAPI_FILE, 'utf8');
  const lines = content.split(/\r?\n/);
  const operations = new Set();
  let currentPath = null;

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/i);
    if (currentPath && methodMatch) {
      operations.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }

  return operations;
}

function toSortedArray(values) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function main() {
  const routes = collectRouteOperations();
  const spec = collectOpenApiOperations();

  const missingInSpec = toSortedArray(
    new Set([...routes].filter((operation) => !spec.has(operation)))
  );
  const missingInRoutes = toSortedArray(
    new Set([...spec].filter((operation) => !routes.has(operation)))
  );

  if (missingInSpec.length === 0 && missingInRoutes.length === 0) {
    console.log('OpenAPI route coverage is in sync.');
    return;
  }

  if (missingInSpec.length > 0) {
    console.error('Missing in openapi.yaml:');
    missingInSpec.forEach((operation) => console.error(`  - ${operation}`));
  }

  if (missingInRoutes.length > 0) {
    console.error('Missing in backend routes:');
    missingInRoutes.forEach((operation) => console.error(`  - ${operation}`));
  }

  process.exit(1);
}

main();
