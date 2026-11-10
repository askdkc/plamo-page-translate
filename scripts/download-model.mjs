import { readFile, mkdir, stat, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
const model = JSON.parse(await readFile('models/model.json','utf8'));
const path = `models/${model.file}`;
async function valid(file) {
  if ((await stat(file).catch(()=>null))?.size !== model.bytes) return false;
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex')===model.sha256;
}
await mkdir('models',{recursive:true});
if (await valid(path)) {console.log('Verified model already present.');process.exit(0);}
if (!await valid(`${path}.part`)) {
  console.log(`Downloading ${model.bytes} bytes from the official pinned revision…`);
  const response=await fetch(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.file}`,{signal:AbortSignal.timeout(1800000)});
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(response.body,createWriteStream(`${path}.part`));
}
if (!await valid(`${path}.part`)) {await rm(`${path}.part`,{force:true});throw new Error('Model checksum mismatch.');}
await rename(`${path}.part`,path);
console.log('Model SHA-256 verified.');
