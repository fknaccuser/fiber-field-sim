import { mkdir, writeFile } from 'node:fs/promises';
import { ISSUES } from '../src/solo/issues.js';

const directory = new URL('../data/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('issues-v1.json', directory), JSON.stringify({ schema: 'field-issues-1', total: ISSUES.length, issues: ISSUES }, null, 2) + '\n');
console.log(`Exported ${ISSUES.length} issues to data/issues-v1.json`);
