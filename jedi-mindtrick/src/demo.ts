/** Original procedural preview; not a webcam recording or model output. */
export function drawDemo(ctx: CanvasRenderingContext2D, now: number, person = true) {
  const { width: w, height: h } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#143a3b'); g.addColorStop(.6, '#0a2023'); g.addColorStop(1, '#28352e'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#609b9330'; ctx.lineWidth = 1;
  for (let i = 0; i < 15; i++) { ctx.beginPath(); ctx.moveTo(w/2, h*.53); ctx.lineTo((i-2)*w/10, h); ctx.stroke(); }
  for (let y = h*.64; y<h; y+=h*.09) { ctx.beginPath(); ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke(); }
  ctx.fillStyle = '#142e31';ctx.fillRect(w*.12,h*.13,w*.24,h*.47);
  const sky=ctx.createLinearGradient(0,h*.14,0,h*.54);sky.addColorStop(0,'#b6d6ba');sky.addColorStop(1,'#477f76');ctx.fillStyle=sky;ctx.fillRect(w*.135,h*.15,w*.21,h*.43);
  ctx.fillStyle='#b8e8c9';ctx.beginPath();ctx.arc(w*.282,h*.24,h*.045,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#254f50';ctx.beginPath();ctx.moveTo(w*.135,h*.58);ctx.lineTo(w*.2,h*.35);ctx.lineTo(w*.24,h*.48);ctx.lineTo(w*.3,h*.31);ctx.lineTo(w*.345,h*.53);ctx.lineTo(w*.345,h*.58);ctx.fill();
  ctx.strokeStyle='#163234';ctx.lineWidth=6;ctx.strokeRect(w*.135,h*.15,w*.21,h*.43);
  ctx.fillStyle='#36534c';ctx.fillRect(w*.8,h*.66,w*.1,h*.15);ctx.strokeStyle='#6eae86';ctx.lineWidth=3;
  for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(w*.85,h*.68);ctx.quadraticCurveTo(w*(.75+i*.028),h*.35,w*(.75+i*.04),h*(.4+(i%2)*.1));ctx.stroke();}
  if(person){
    ctx.save();ctx.translate(w*.54,h*.53);
    ctx.shadowColor='#90cfc055';ctx.shadowBlur=25;
    const body=ctx.createLinearGradient(-w*.1,0,w*.1,0);body.addColorStop(0,'#74b5a6');body.addColorStop(.5,'#224b4b');body.addColorStop(1,'#a3c9ad');ctx.fillStyle=body;
    ctx.beginPath();ctx.ellipse(0,-h*.18,w*.046,h*.087,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-w*.05,-h*.07);ctx.quadraticCurveTo(-w*.15,-h*.04,-w*.135,h*.18);ctx.lineTo(-w*.095,h*.21);ctx.lineTo(-w*.068,h*.07);ctx.lineTo(-w*.068,h*.35);ctx.lineTo(w*.067,h*.35);ctx.lineTo(w*.067,h*.07);ctx.lineTo(w*.12,h*.14);ctx.lineTo(w*.145,-h*.04);ctx.lineTo(w*.12,-h*.055);ctx.lineTo(w*.095,h*.04);ctx.quadraticCurveTo(w*.05,-h*.07,-w*.05,-h*.07);ctx.fill();ctx.restore();
  }
  ctx.fillStyle='#a4d8bb';
  for(let i=0;i<25;i++){const x=(Math.sin(i*13.2)*.5+.5)*w,y=((i/25+now/70000)%1)*h;ctx.globalAlpha=.13+(i%3)*.08;ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;
}

export function demoMask(w: number,h: number): Float32Array {
  const mask=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=x/w-.54,dy=y/h-.53;
    const head=(dx/.052)**2+((dy+.18)/.095)**2<1;
    const torso=Math.abs(dx)<.08&&dy>-.09&&dy<.35;
    const arms=dx>-.15&&dx<.15&&dy>-.06&&dy<.21;
    mask[y*w+x]=head||torso||arms?1:0;
  }return mask;
}
