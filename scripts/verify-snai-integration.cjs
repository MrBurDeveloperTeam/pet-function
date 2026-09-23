// Compiles seven host SNAI integrations against local shared build without
// changing dependency manifests, lockfiles, node_modules, or calling APIs.
const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const entries = [
  'inventory/components/MolarAIFloat.tsx',
  'inventory/services/geminiService.ts',
  'appointment/src/components/MolarAIFloat.jsx',
  'appointment/src/services/geminiService.js',
  'calculator/components/MolarAIFloat.jsx',
  'calculator/services/geminiService.ts',
  'todo/src/components/MolarAIFloat.jsx',
  'todo/src/services/geminiService.ts',
  'Image-generator/src/components/MolarAIFloat.jsx',
  'Image-generator/src/services/geminiService.js',
  'E-learning/src/components/MolarAIFloat.jsx',
  'E-learning/src/services/geminiService.ts',
  'snabb-superapp/App.tsx',
  'snabb-superapp/services/geminiService.ts',
];
const prefix = '@mrburdeveloperteam/pet-function';
const exported = require('../package.json').exports;
(async () => {
  for (const entry of entries) {
    await build({
      entryPoints:[path.join(root,entry)], bundle:true, write:false,
      outdir:path.join(root,'pet-function/dist/integration-check'), format:'esm',
      packages:'external', logLevel:'silent',
      loader:{'.css':'empty','.png':'dataurl','.jpg':'dataurl','.jpeg':'dataurl','.webp':'dataurl','.gif':'dataurl','.svg':'dataurl','.mp3':'dataurl','.mp4':'dataurl','.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},
      plugins:[{name:'local-pet-function',setup(build){
        build.onResolve({filter:/^@mrburdeveloperteam\/pet-function(?:\/|$)/},args=>{
          const subpath=args.path===prefix?'.':'.'+args.path.slice(prefix.length);
          const target=exported[subpath];
          if(!target)throw new Error('Unknown shared export: '+subpath);
          return {path:path.resolve(root,'pet-function',typeof target==='string'?target:target.import)};
        });
      }}],
    });
    console.log('PASS '+entry);
  }
})().catch(error=>{console.error(error);process.exitCode=1});
