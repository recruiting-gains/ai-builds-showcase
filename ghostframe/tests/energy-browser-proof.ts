import { CubeRenderer } from '../src/cube/renderer';
import { EnergyResponse } from '../src/cube/energy';

const canvas = document.querySelector<HTMLCanvasElement>('#proof')!;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const output = document.querySelector('#results')!;
const status = document.querySelector('#status')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const record = document.querySelector<HTMLButtonElement>('#record')!;
const replay = document.querySelector<HTMLVideoElement>('#replay')!;
const download = document.querySelector<HTMLAnchorElement>('#download')!;
const report: { at: string; checks: { name: string; passed: boolean; details?: unknown }[]; limitation: string } = {
  at: new Date().toISOString(), checks: [],
  limitation: 'Synthetic component-level browser proof, not physical phone, MediaPipe accuracy or full app recording-button integration.',
};
let renderer = new CubeRenderer(message => { status.textContent = message; });
let running = false, stream: MediaStream | null = null, objectUrl: string | null = null;
const check = (name: string, passed: boolean, details?: unknown) => {
  report.checks.push({ name, passed, details }); output.textContent = JSON.stringify(report, null, 2);
};
function background(bright = false) {
  ctx.fillStyle = bright ? '#dededb' : '#101821'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = bright ? '#c4c4c0' : '#263643'; ctx.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke(); }
  ctx.fillStyle = bright ? '#aaa9a7' : '#304251';
  ctx.beginPath();ctx.ellipse(canvas.width / 2,canvas.height * .44,canvas.width * .13,canvas.width * .16,0,0,Math.PI*2);ctx.fill();
  ctx.fillRect(canvas.width * .30,canvas.height*.54,canvas.width*.4,canvas.height*.28);
  ctx.font = '12px system-ui'; ctx.fillStyle = bright ? '#253341' : '#adbfce';
  ctx.fillText('ACTUAL RENDERER / SYNTHETIC INPUT',12,28);
}
const pixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
const delta = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let changed = 0, outside = 0, minX=canvas.width, minY=canvas.height, maxX=0, maxY=0;
  for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
    const i=(y*canvas.width+x)*4;
    const diff=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    if(diff>8){changed++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x<canvas.width*.10||x>canvas.width*.90||y<canvas.height*.10||y>canvas.height*.90)outside++;}
  }
  return {changed,outside,bounds:changed?[minX,minY,maxX,maxY]:null};
};
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const identical = (a:Uint8ClampedArray,b:Uint8ClampedArray) => a.length===b.length&&a.every((value,index)=>value===b[index]);
function draw(size=.5,bright=false,energy=true,now=4000,reduced=false) {
  background(bright);
  return renderer.draw(ctx,{x:.5,y:.5,size},0,now,reduced,energy?{strength:.6,spread:(size-.15)/.5,phase:reduced?0:now/1000}:undefined);
}
run.onclick = async () => {
  run.disabled = true; report.checks=[];
  try {
    for(const [width,height] of [[360,640],[640,360]]) {
      canvas.width=width;canvas.height=height;
      for(const bright of [false,true]) for(const size of [.15,.38,.65]) {
        background(bright);const original=pixels();
        const classicOk=draw(size,bright,false);const classic=pixels();
        const energyOk=draw(size,bright,true);const energy=pixels();
        const difference=delta(classic,energy), bounded=delta(original,energy);
        check(`${width}×${height} / ${bright?'bright':'dark'} / size ${size}`,classicOk&&energyOk&&difference.changed>10&&bounded.outside===0,{difference,bounded});
      }
    }
    canvas.width=360;canvas.height=640;
    background();const backdrop=ctx.getImageData(0,0,360,640);
    const staticDraw=(now:number)=>{ctx.putImageData(backdrop,0,0);return renderer.draw(ctx,{x:.5,y:.5,size:.5},0,now,true,{strength:.6,spread:.7,phase:0});};
    // Fixed background pixels isolate the effect from 2D ellipse edge rerasterization.
    // Includes the first actual renderer call after the portrait backing-store resize.
    const aOk=staticDraw(0);const still=pixels();const bOk=staticDraw(0);const second=pixels();const cOk=staticDraw(9000);const third=pixels();
    const reducedDelta={...delta(still,second),secondToThird:delta(second,third)};
    check('Reduced-motion effect stays pixel-identical including first resize frame',aOk&&bOk&&cOk&&identical(still,second)&&identical(second,third),{...reducedDelta,aOk,bOk,cOk,strictBytes:true});
    const classicDraw=()=>{ctx.putImageData(backdrop,0,0);return renderer.draw(ctx,{x:.5,y:.5,size:.5},0,4000,false);};
    const baselineOk=classicDraw();const baseline=pixels();draw(.5,false,true);const restoredOk=classicDraw();
    check('Classic toggle restores identical original output',baselineOk&&restoredOk&&identical(baseline,pixels()),{strictBytes:true,baselineOk,restoredOk,difference:delta(baseline,pixels())});
    renderer.dispose();check('Disposed renderer fails closed',!draw());
    renderer = new CubeRenderer(message=>{status.textContent=message;});
    check('Explicit fresh renderer recovers',draw());
    record.disabled=report.checks.some(item=>!item.passed);
    status.textContent = record.disabled ? 'A check failed. Recording remains disabled.' : 'Browser matrix passed. Ready to record and replay.';
  } catch(error) { check('Unhandled browser failure',false,String(error)); }
  finally { run.disabled=false; }
};
record.onclick = async () => {
  record.disabled=true;run.disabled=true;running=true;
  const response=new EnergyResponse(), chunks:BlobPart[]=[];
  const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp9','video/webm;codecs=vp8'].find(value=>MediaRecorder.isTypeSupported(value));
  let recorder: MediaRecorder | null=null;
  try {
    if(!mime)throw new Error('No supported local recording codec');
    stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    const stopped=new Promise<void>(resolve=>{recorder!.onstop=()=>resolve();});
    recorder.start(200);const start=performance.now();let frames=0;
    status.textContent='Recording synthetic open → spread → carry → settle → violet. 6 seconds.';
    while(running&&performance.now()-start<6000) {
      const now=await nextFrame(), seconds=(now-start)/1000;
      const x=.5+Math.sin(Math.min(Math.max(seconds-2,0),2)*Math.PI)*.16;
      const size=.25+Math.min(seconds,2)/2*.32;
      const pose={x,y:.5,size};background();
      renderer.draw(ctx,pose,seconds>5?1:0,now,false,response.update(pose,now,canvas.width/canvas.height));frames++;
    }
    recorder.stop();await stopped;
    const blob=new Blob(chunks,{type:mime});if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);
    replay.src=objectUrl;download.href=objectUrl;download.download=`ghostframe-energy-runtime.${mime.includes('mp4')?'mp4':'webm'}`;download.hidden=false;
    await Promise.race([new Promise<void>((resolve,reject)=>{replay.onloadeddata=()=>resolve();replay.onerror=()=>reject(new Error('Replay decode failed'));}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Decode timeout')),10000))]);
    check('Local recording decodes with correct portrait dimensions',replay.videoWidth===360&&replay.videoHeight===640&&blob.size>1000,{bytes:blob.size,mime,frames,videoWidth:replay.videoWidth,videoHeight:replay.videoHeight});
    const decoded=document.createElement('canvas');decoded.width=360;decoded.height=640;const dctx=decoded.getContext('2d')!;
    await replay.play();await new Promise(resolve=>setTimeout(resolve,1800));dctx.drawImage(replay,0,0);replay.pause();
    const data=dctx.getImageData(0,0,360,640).data;let chroma=0;
    for(let i=0;i<data.length;i+=4)if(data[i+2]>100&&data[i+2]-data[i]>25&&data[i+1]>80)chroma++;
    check('Decoded saved clip contains the colored energy object',chroma>100,{chroma});
    status.textContent='Recorded and decoded. Review the actual clip below; physical-phone test still pending.';
  } catch(error){check('Recording failure',false,String(error));status.textContent='Recording check failed.';}
  finally{running=false;if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(track=>track.stop());stream=null;run.disabled=false;record.disabled=false;}
};
window.addEventListener('pagehide',()=>{running=false;stream?.getTracks().forEach(track=>track.stop());renderer.dispose();if(objectUrl)URL.revokeObjectURL(objectUrl);});
draw();
