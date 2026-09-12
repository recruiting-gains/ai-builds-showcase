// Deterministic landmarks for browser integration checks only. Never shipped as a vision worker.
let count=0;
function hand(x,scale,name){
  const landmarks=Array.from({length:21},()=>({x,y:.60,z:0}));
  landmarks[0]={x,y:.68,z:0};landmarks[5]={x:x-.05,y:.54,z:0};landmarks[9]={x,y:.52,z:0};landmarks[17]={x:x+.05,y:.58,z:0};
  landmarks[4]={x:x+(x>.5?-.09:.09),y:.48,z:0};landmarks[8]={x,y:.30,z:0};
  for(const i of [5,9,17]){landmarks[i].x=x+(landmarks[i].x-x)*scale;landmarks[i].y=.68+(landmarks[i].y-.68)*scale;}
  return {landmarks,score:.95,handedness:name};
}
self.onmessage=({data})=>{
  if(data.type==='init'){self.postMessage({type:'ready'});return;}
  if(data.type!=='frame')return;
  data.bitmap.close();count++;
  if(count>=72){self.postMessage({type:'error',message:'Controlled tracking failure for recovery test.'});return;}
  const left=count>10&&count<=26?1.4:1,right=count>26&&count<=42?1.4:1;
  const hands=count>42&&count<=54?[]:[hand(.75,left,'Left'),hand(.25,right,'Right')];
  self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands,inferenceMs:1});
};
