import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
mkdirSync(new URL('../dist/',import.meta.url),{recursive:true});
writeFileSync(new URL('../dist/worker.js',import.meta.url),'const PAGE = '+JSON.stringify(html)+';\n'+worker);
console.log('Built dist/worker.js from public/index.html and src/worker.js');