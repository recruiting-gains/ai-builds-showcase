// Starts a bounded local production preview, verifies it, then releases the server.
import { spawn } from 'node:child_process';
const root=new URL('../',import.meta.url);
const base='http://127.0.0.1:8805';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','8805','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverLog='',child;
server.stdout.on('data',data=>serverLog+=data);server.stderr.on('data',data=>serverLog+=data);
const timeout=setTimeout(()=>{child?.kill('SIGTERM');server.kill('SIGTERM');process.exitCode=1;},180000);
try{
 let ready=false;
 for(let attempt=0;attempt<40;attempt++){
  if(server.exitCode!==null)throw new Error(`Preview server stopped: ${serverLog}`);
  try{const response=await fetch(base,{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{/* Startup only: bounded readiness checks. */}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!ready)throw new Error(`Preview server did not become ready: ${serverLog}`);
 child=spawn(process.execPath,['--import','tsx','scripts/phone-studio-browser-check.mjs',base],{cwd:root,stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(timeout);child?.kill('SIGTERM');server.kill('SIGTERM');}
