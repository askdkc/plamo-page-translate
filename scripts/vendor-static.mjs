import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

// wllama 3.13.0 assembles worker strings at runtime. MV3 requires packaged
// worker files. Extract those exact bundled sources at build time instead.
export async function prepareStaticWorkers() {
  let source = await readFile('node_modules/@wllama/wllama/esm/index.js','utf8');
  const literal = name => {
    const prefix = `var ${name} = `;
    const start = source.indexOf(prefix);
    if (start < 0) throw new Error(`Missing vendor constant: ${name}`);
    const end = source[start + prefix.length] === '`' ? source.indexOf('`;\n',start) + 1 : source.indexOf(';\n',start);
    return vm.runInNewContext(source.slice(start + prefix.length,end),Object.create(null),{timeout:1000});
  };
  const moduleCode = literal('JSPI_STUB') + literal('WLLAMA_EMSCRIPTEN_CODE');
  const workerCode = literal('LLAMA_CPP_WORKER_CODE');
  await writeFile('dist/vendor/wllama-worker.js', [
    '// Derived from wllama 3.13.0 (MIT); see wllama-LICENSE.',
    'const RUN_OPTIONS = JSON.parse(new URL(location.href).searchParams.get("options"));',
    `function wModuleInit() { ${moduleCode.replace('var Module','var ___Module')}; return Module; }`,
    workerCode,
  ].join('\n'));
  await writeFile('dist/vendor/wllama-pthread.js',moduleCode);
  await writeFile('dist/vendor/wllama-opfs.js',literal('OPFS_UTILS_WORKER_CODE'));
  const replace = (before,after) => {
    if (source.split(before).length !== 2) throw new Error('wllama worker patch no longer matches its pinned release.');
    source=source.replace(before,after);
  };
  replace('this.worker = createWorker(completeCode);',`this.worker = new Worker(new URL('vendor/wllama-worker.js?options=' + encodeURIComponent(JSON.stringify(runOptions)), location.href), {type:'module'});`);
  replace('new Blob([moduleCode], { type: "text/javascript" }),','new URL("vendor/wllama-pthread.js", location.href).href,');
  replace('const worker = createWorker(OPFS_UTILS_WORKER_CODE);','const worker = new Worker(new URL("vendor/wllama-opfs.js", location.href), {type:"module"});');
  return source;
}
