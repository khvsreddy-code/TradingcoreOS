import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
if(!/^dist\/$/m.test(ignore)) throw new Error('dist must be ignored');
if (fs.existsSync(path.join(root,'.git'))) { const tracked=execFileSync('git',['ls-files','dist'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); if(tracked) throw new Error(`generated dist artifacts are tracked: ${tracked.split('\n').slice(0,3).join(', ')}`); }
console.log('TCO_V113_GENERATED_ARTIFACT_HYGIENE_OK');
