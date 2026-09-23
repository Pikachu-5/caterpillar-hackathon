import fs from 'node:fs/promises';
import path from 'node:path';
import {compileFromFile} from 'json-schema-to-typescript';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'shared/types/index.d.ts');
const result = await compileFromFile(path.join(root, 'shared/schemas/contracts.schema.json'), {
  bannerComment: '/* Generated from shared/schemas. Do not edit; run npm run contracts:generate. */',
  cwd: path.join(root, 'shared/schemas'),
  additionalProperties: false,
  style: {singleQuote: false},
});
if (process.argv.includes('--check')) {
  const current = await fs.readFile(output, 'utf8').catch(() => '');
  if (current !== result) throw new Error('Generated contracts are stale. Run npm run contracts:generate and commit the result.');
  console.log('Generated TypeScript contracts match the schemas.');
} else {
  await fs.mkdir(path.dirname(output), {recursive: true});
  await fs.writeFile(output, result);
  console.log('Generated shared/types/index.d.ts');
}
