import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const { version } = JSON.parse(await readFile('src/manifest.json', 'utf8'));
const archive = `release/plamo-page-translate-${version}.zip`;
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
await mkdir('release',{recursive:true});
await rm(archive,{force:true});
execFileSync('zip',['-q','-r',`../${archive}`,'.'],{cwd:'dist',stdio:'inherit'});
console.log(`Created ${archive}`);
