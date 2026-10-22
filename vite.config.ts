import { defineConfig } from 'vite';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { autoRouteHtml } from './scripts/staticRoutes';
let outputDirectory='';
export default defineConfig({
  base:'./',
  worker:{format:'es'},
  plugins:[{
    name:'auto-route',
    configResolved(config){outputDirectory=resolve(config.root,config.build.outDir);},
    async closeBundle(){
      const root=await readFile(resolve(outputDirectory,'index.html'),'utf8');
      await mkdir(resolve(outputDirectory,'auto'),{recursive:true});
      await writeFile(resolve(outputDirectory,'auto/index.html'),autoRouteHtml(root));
    }
  }],
  build:{rollupOptions:{output:{manualChunks:{graphics:['three']}}}},
});
