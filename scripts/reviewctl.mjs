import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(repo,'../..');
const [command,...args]=process.argv.slice(2);
const options={};
for(let i=1;i<args.length;i+=2) options[args[i].replace(/^--/,'')]=args[i+1];
let endpoint,body;
if(command==='publish') {
  if(!args[0]) throw new Error('Usage: node scripts/reviewctl.mjs publish <GLB-or-STL> [--name title] [--version v1] [--source source-file] [--units mm]');
  endpoint='/publish';body={file:path.relative(workspace,path.resolve(args[0])),...options};
  if(body.source) body.source=path.relative(workspace,path.resolve(body.source));
} else if(command==='status') endpoint='/status';
else if(command==='submissions') endpoint='/submissions';
else throw new Error('Commands: publish, status, submissions');
const socketPath=path.join(path.resolve(process.env.REVIEW_DATA_DIR || path.join(repo,'runtime')),'agent.sock');
const req=http.request({socketPath,path:endpoint,method:body?'POST':'GET',headers:{'Content-Type':'application/json'}},res=>{
  let data='';res.on('data',d=>data+=d);res.on('end',()=>{console.log(data);if(res.statusCode>=400)process.exitCode=1;});
});
req.on('error',()=>{console.error('審閱服務尚未啟動。請先 npm start。');process.exitCode=1;});
req.end(body?JSON.stringify(body):undefined);
