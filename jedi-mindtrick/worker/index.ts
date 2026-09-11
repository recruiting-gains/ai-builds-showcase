import { DurableObject } from 'cloudflare:workers';
import { MAX_BODY, STYLES, validateRender, readBounded, type RenderInput } from './validation';

const MODEL='@cf/runwayml/stable-diffusion-v1-5-img2img' as const;
const headers={ 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
const error=(message:string,status=400)=>Response.json({error:message},{status,headers});

/** One coordination object for this small preview's shared daily budget (20 calls).
 * Stores IDs/hashes/status for 48 hours, never camera or generated pixels. */
export class RenderLedger extends DurableObject<Env> {
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL)');
  }
  async render(input:RenderInput):Promise<Response>{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.image+'\n'+input.style));
    const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    const now=Date.now();
    this.ctx.storage.sql.exec('DELETE FROM requests WHERE created < ?',now-48*60*60*1000);
    const previous=this.ctx.storage.sql.exec<{hash:string;status:string}>('SELECT hash,status FROM requests WHERE id=?',input.requestId).toArray()[0];
    if(previous)return error(previous.hash!==hash?'Request ID belongs to a different image or style.':'This request was already submitted. To avoid a duplicate render it will not be repeated.',409);
    const dayStart=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z');
    const count=this.ctx.storage.sql.exec<{n:number}>('SELECT COUNT(*) AS n FROM requests WHERE created >= ?',dayStart).one().n;
    if(count>=20)return error('Today’s shared AI preview allowance is used. Local styles still work; try AI again tomorrow.',429);
    // These synchronous statements run without an interleaving await: claim before any model call.
    this.ctx.storage.sql.exec('INSERT INTO requests VALUES (?, ?, ?, ?)',input.requestId,hash,'submitted',now);
    await this.ctx.storage.setAlarm(Date.now()+48*60*60*1000);
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const abort=new AbortController();let activeReader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try {
      const generated=await Promise.race([
        (async()=>{
          const stream=await this.env.AI.run(MODEL,{prompt:STYLES[input.style],image_b64:input.image,strength:.65,num_steps:20,width:512,height:512},{signal:abort.signal});
          const reader=stream.getReader();activeReader=reader;const parts:Uint8Array[]=[];let size=0;
          try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4_000_000){await reader.cancel();throw new Error('Image too large');}parts.push(value);}}
          finally{reader.releaseLock();}
          const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
          if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw new Error('Invalid generated image');
          return bytes;
        })(),
        new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{abort.abort();void activeReader?.cancel().catch(()=>{});reject(new Error('TIMEOUT'));},45000);})
      ]);
      this.ctx.storage.sql.exec('UPDATE requests SET status=? WHERE id=?','complete',input.requestId);
      return new Response(generated,{headers:{...headers,'Content-Type':'image/png','X-Render-Id':input.requestId}});
    } catch {
      this.ctx.storage.sql.exec('UPDATE requests SET status=? WHERE id=?','unknown-or-failed',input.requestId);
      return error('The AI render did not return an image in time. Your local preview is safe. This request will not be repeated automatically.',502);
    } finally {if(timeout)clearTimeout(timeout);}
  }
  async alarm(){
    const now=Date.now();this.ctx.storage.sql.exec('DELETE FROM requests WHERE created < ?',now-48*60*60*1000);
    const next=this.ctx.storage.sql.exec<{created:number}>('SELECT created FROM requests ORDER BY created LIMIT 1').toArray()[0];
    if(next)await this.ctx.storage.setAlarm(Math.max(now+1000,next.created+48*60*60*1000+1));
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/api/health')return Response.json({ok:true,app:'Jedi mindtrick',version:'0.1.0'},{headers});
    if(url.pathname==='/api/config')return Response.json({aiEnabled:env.AI_RENDER_ENABLED==='true',provider:'Cloudflare Workers AI',model:MODEL,dailyLimit:20,localProcessing:true},{headers});
    if(url.pathname==='/api/render'){
      if(request.method!=='POST')return error('Use POST.',405);
      if(env.AI_RENDER_ENABLED!=='true')return error('AI rendering is unavailable. Local styles still work.',503);
      if(request.headers.get('Origin')!==url.origin)return error('Submit the still from this application.',403);
      if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return error('Expected JSON.',415);
      try {
        const input=validateRender(JSON.parse(await readBounded(request,MAX_BODY)));
        return await env.RENDER_LEDGER.getByName('preview-budget-v1').render(input);
      } catch(e){return error(e instanceof Error?e.message:'Invalid still request.');}
    }
    if(url.pathname.startsWith('/api/'))return error('Not found.',404);
    const response=await env.ASSETS.fetch(request);const safe=new Response(response.body,response);
    safe.headers.set('X-Content-Type-Options','nosniff');
    safe.headers.set('Referrer-Policy','no-referrer');
    safe.headers.set('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    safe.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    return safe;
  }
} satisfies ExportedHandler<Env>;
