import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const schemaDir = 'shared/schemas';
const names = fs.readdirSync(path.join(root, schemaDir)).filter(x => x.endsWith('.schema.json')).sort();
const ajv = new Ajv2020({allErrors: true, strict: true});
addFormats(ajv, {mode: 'full'});
const schemas = names.map(n => read(`${schemaDir}/${n}`));
for (const schema of schemas) ajv.addSchema(schema);
for (const schema of schemas) {
  assert(ajv.validateSchema(schema), JSON.stringify(ajv.errors));
  assert(ajv.getSchema(schema.$id), `Could not compile ${schema.$id}`);
}
const base = 'https://schemas.cat-operator-hub.example/v1/';
const fixtures = read('shared/fixtures/manifest.json');
for (const {file, schema} of fixtures) {
  const validate = ajv.getSchema(base + schema);
  assert(validate, `Missing fixture schema ${schema}`);
  assert(validate(read(`shared/fixtures/${file}`)), `${file}: ${JSON.stringify(validate.errors)}`);
}

// These are contract failure checks, not unimplemented product behavior tests.
const failures = [
  ['world-frame', x => { x.sequence = -1; }],
  ['world-frame', x => { x.timestamp = '2026-99-23T10:00:00Z'; }],
  ['world-frame', x => { x.timestamp = '2026-09-23T10:00:00+05:30'; }],
  ['world-frame', x => { x.telemetry.machine_model = 'CAT 320'; }],
  ['world-frame', x => { x.telemetry.fuel_percent = 101; }],
  ['world-frame', x => { delete x.telemetry.seatbelt_fastened; }],
  ['world-frame', x => { x.telemetry.engineTemp = 70; }],
  ['world-frame', x => { x.telemetry.heading_deg = 360; }],
  ['work-event', x => { x.quantity_m3 = -2; }],
  ['environment', x => { x.soil_moisture_percent_vwc = 101; }],
  ['historical-task', x => { x.task_type = 'Invented Category'; }],
  ['historical-operation', x => { x.load_cycles = 1.5; }],
  ['historical-operation', x => { x.provenance = 'synthetic'; }],
  ['historical-task', x => { x.provenance = 'synthetic'; }],
  ['safety-event', x => { x.action = 'stop_machine'; }],
];
for (const [name, mutate] of failures) {
  const value = read(`shared/fixtures/${name}.json`);
  mutate(value);
  assert(!ajv.getSchema(base + name + '.schema.json')(value), `Invalid ${name} example was accepted`);
}

// All $refs must resolve locally, including fragments, without an HTTP lookup.
function pointer(doc, fragment) {
  if (!fragment) return doc;
  assert(fragment.startsWith('/'), `Unsupported JSON pointer ${fragment}`);
  let value = doc;
  for (const key of fragment.slice(1).split('/').map(x => decodeURIComponent(x).replaceAll('~1','/').replaceAll('~0','~'))) {
    assert(value && Object.hasOwn(value, key), `Missing JSON pointer component ${key}`);
    value = value[key];
  }
  return value;
}
function refs(value, file) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    const [target, fragment] = value.$ref.split('#');
    let resolved;
    if (!target) resolved = file;
    else if (target.startsWith(base)) resolved = path.join(root, schemaDir, target.slice(base.length));
    else {
      assert(!/^https?:/.test(target), `Unexpected remote reference ${target}`);
      resolved = path.resolve(path.dirname(file), target);
    }
    assert(fs.existsSync(resolved), `Unresolved ${value.$ref} from ${file}`);
    pointer(JSON.parse(fs.readFileSync(resolved, 'utf8')), fragment);
  }
  for (const child of Object.values(value)) refs(child, file);
}
for (const name of names) refs(read(`${schemaDir}/${name}`), path.join(root, schemaDir, name));
const api = read('shared/openapi.json');
refs(api, path.join(root, 'shared/openapi.json'));
assert.equal(api.openapi, '3.1.0');
const operations = new Set();
let endpointCount = 0;
for (const [url, methods] of Object.entries(api.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    assert(!operations.has(spec.operationId), `Duplicate operation ID ${spec.operationId}`);
    operations.add(spec.operationId);
    assert(spec.responses, `No responses for ${url}`);
    for (const [, key] of url.matchAll(/\{([^}]+)\}/g)) {
      assert(spec.parameters?.some(p => p.in === 'path' && p.name === key && p.required), `Missing path parameter ${key}`);
    }
    if (['post','put','patch','delete'].includes(method) && spec.security?.length !== 0) {
      assert(spec.parameters?.some(p => p.name === 'X-CSRF-Token' && p.required), `Missing CSRF contract ${url}`);
    }
    endpointCount++;
  }
}

// Preserve the supplied photo rows; generated data must not overwrite them.
const expectedOperations = [
  'Timestamp,Machine ID,Operator ID,Engine Hours,Fuel Used (L),Load Cycles,Idling Time (min),Seatbelt Status,Safety Alert Triggered',
  '2025-05-01 08:00:00,EXC001,OP1001,1523.5,5.2,12,30,Fastened,No',
  '2025-05-01 10:00:00,EXC001,OP1001,1524.8,3.8,2,55,Unfastened,Yes',
  '2025-05-01 14:00:00,EXC001,OP1001,1526.5,6.1,10,15,Fastened,No',
  '2025-05-02 09:00:00,EXC001,OP1001,1530.2,2.0,1,60,Unfastened,Yes',
];
const expectedTasks = [
  'Task ID,Task Type,Weather,Operator Skill,Machine Age (yrs),Estimated Time (min),Actual Time (min)',
  'T001,Earth Excavation,Sunny,Expert,2,60,58',
  'T002,Trenching,Rainy,Intermediate,4,45,52',
  'T003,Material Loading,Cloudy,Beginner,3,30,42',
  'T004,Grading,Sunny,Expert,5,35,33',
  'T005,Demolition,Windy,Intermediate,6,90,105',
];
for (const [file, lines] of [['operations.csv', expectedOperations], ['tasks.csv', expectedTasks]]) {
  assert.deepEqual(fs.readFileSync(path.join(root, 'data/reference', file), 'utf8').trim().split(/\r?\n/), lines);
}
const provenance = read('data/reference/provenance.json');
for (const file of provenance.files) {
  const bytes = fs.readFileSync(path.join(root, 'data/reference', file.filename));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
}

// Validate local documentation links; fragments inside Markdown are not evaluated here.
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git','node_modules','.venv'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}
let docs = 0;
for (const file of walk(root)) {
  if (!file.endsWith('.md')) continue;
  docs++;
  const body = fs.readFileSync(file, 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert(fs.existsSync(path.resolve(path.dirname(file), target)), `Broken link ${target} in ${file}`);
  }
}
const config = read('config/demo-defaults.json');
assert(config.disconnected_after_s > config.stale_after_s);
assert(config.telemetry_hz >= config.persistence_hz);
assert(config.safety.proximity_critical_clearance_m < config.safety.proximity_warning_clearance_m);
console.log(`Passed: ${names.length} schemas, ${fixtures.length} fixtures, ${failures.length} rejection checks, ${endpointCount} API operations, ${docs} Markdown files, original sample/provenance checks.`);
