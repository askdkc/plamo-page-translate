import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
await mkdir('release',{recursive:true});
await rm('release/plamo-page-translate-0.1.0.zip',{force:true});
execFileSync('zip',['-q','-r','../release/plamo-page-translate-0.1.0.zip','.'],{cwd:'dist',stdio:'inherit'});
console.log('Created release/plamo-page-translate-0.1.0.zip');
