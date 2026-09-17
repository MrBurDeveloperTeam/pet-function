import {existsSync,statSync,createReadStream,readdirSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import {resolve,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const canonical=fileURLToPath(new URL('../public/games/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ttf':'font/ttf'};
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
export function sharedGamesPlugin(){
 let config;
 return {
  name:'pet-function-games',
  config(){return {build:{copyPublicDir:false}};},
  configResolved(value){config=value;},
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    let url;try{url=decodeURIComponent((req.url||'').split('?')[0]);}catch{res.statusCode=400;res.end();return;}
    if(!url.startsWith('/games/'))return next();
    const path=resolve(canonical,url.slice('/games/'.length));
    const rel=relative(canonical,path);
    if(rel.startsWith('..')||resolve(path)===resolve(canonical)){res.statusCode=403;res.end();return;}
    const target=existsSync(path)&&statSync(path).isDirectory()?join(path,'index.html'):path;
    if(!existsSync(target)||!statSync(target).isFile()){res.statusCode=404;res.end('Shared game resource not found');return;}
    res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    const stream=createReadStream(target);stream.on('error',()=>res.destroy());stream.pipe(res);
   });
  },
  closeBundle(){
   if(config.command!=='build')return;
   const out=resolve(config.root,config.build.outDir);
   // Deliver other host public resources normally, but NEVER the legacy games.
   if(config.publicDir)for(const source of files(config.publicDir)){
    const name=relative(config.publicDir,source);
    if(name.split(/[\\/]/)[0]==='games')continue;
    const target=join(out,name);mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(source,target);
   }
   for(const source of files(canonical)){
    const target=join(out,'games',relative(canonical,source));mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(source,target);
    if(!readFileSync(source).equals(readFileSync(target)))throw new Error('Shared game output mismatch: '+target);
   }
  },
 };
}
