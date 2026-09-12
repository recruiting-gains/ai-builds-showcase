import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoPoseTracker, photoHandPose } from '../src/handframe/photo-pose';
import { surfaceMap } from '../src/handframe/surface';
import type { Hand } from '../src/contracts';
const hand=(thumb:[number,number],index:[number,number]):Hand=>{const landmarks=Array.from({length:21},()=>({x:.5,y:.5}));landmarks[4]={x:1-thumb[0],y:thumb[1]};landmarks[8]={x:1-index[0],y:index[1]};return {score:.99,handedness:'Left',landmarks};};
test('whole photo pins to four asymmetric finger corners and its horizon tilts with them',()=>{
 const hands=[hand([.2,.7],[.15,.3]),hand([.8,.55],[.7,.1])];
 const pose=photoHandPose(hands)!;assert.ok(pose);const map=surfaceMap(pose.quad);
 for(const [u,v,point] of [[0,0,[.15,.3]],[1,0,[.7,.1]],[1,1,[.8,.55]],[0,1,[.2,.7]]] as const){const mapped=map(u,v);assert.ok(Math.abs(mapped.x-point[0])<1e-9);assert.ok(Math.abs(mapped.y-point[1])<1e-9);}
 assert.ok(map(.85,.5).y<map(.15,.5).y-.1,'image horizon must tilt rather than remain horizontal');
});
test('inverting one L and reversing detector order preserve the same picture orientation',()=>{
 const normal=[hand([.2,.7],[.2,.2]),hand([.8,.7],[.8,.2])];
 const inverted=[normal[0],hand([.8,.2],[.8,.7])];
 assert.deepEqual(photoHandPose(normal),photoHandPose(inverted));assert.deepEqual(photoHandPose(normal),photoHandPose([...normal].reverse()));
});
test('closed, missing and non-finite corners have no photo projection',()=>{
 assert.equal(photoHandPose([]),null);assert.equal(photoHandPose([hand([.5,.5],[.5,.5]),hand([.5,.5],[.5,.5])]),null);
 assert.equal(photoHandPose([hand([NaN,.5],[.2,.2]),hand([.8,.7],[.8,.2])]),null);
});

const pair=()=>[hand([.2,.7],[.15,.3]),hand([.8,.55],[.7,.1])];
const translated=(offset:number)=>pair().map(h=>({...h,landmarks:h.landmarks.map(point=>({...point,x:point.x-offset}))}));
const rms=(values:number[])=>Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);

test('stationary fingertip noise is damped before mapping the photo',()=>{
 const tracker=new PhotoPoseTracker(),baseline=tracker.update(pair(),0)!;
 const raw:number[]=[],smoothed:number[]=[];
 for(let i=1;i<=90;i++){
  const input=translated(i%2?.003:-.003),target=photoHandPose(input)!,pose=tracker.update(input,i*33)!;
  raw.push(target.quad[0].x-baseline.quad[0].x);smoothed.push(pose.quad[0].x-baseline.quad[0].x);
 }
 assert.ok(rms(smoothed)<rms(raw)*.35,`corner jitter ${rms(smoothed)} must be less than 35% of raw ${rms(raw)}`);
});

test('intentional movement settles within three inference updates without overshoot',()=>{
 for(const shift of [.01,.06,-.06]){
  const tracker=new PhotoPoseTracker(),initial=tracker.update(pair(),0)!,target=photoHandPose(translated(shift))!;
  let pose=initial;
  for(let i=1;i<=3;i++){
   pose=tracker.update(translated(shift),i*33)!;
   assert.ok(pose.quad[0].x>=Math.min(initial.quad[0].x,target.quad[0].x)-1e-9);
   assert.ok(pose.quad[0].x<=Math.max(initial.quad[0].x,target.quad[0].x)+1e-9);
  }
  assert.ok(Math.abs(pose.quad[0].x-target.quad[0].x)<.003);
 }
});

test('brief missing detections hold the pose; prolonged loss or invalid corners clears it',()=>{
 const tracker=new PhotoPoseTracker(),initial=tracker.update(pair(),0)!;
 assert.deepEqual(tracker.update(pair().slice(0,1),33),initial);
 assert.deepEqual(tracker.update([],66),initial);
 assert.deepEqual(tracker.update(pair(),99),initial);
 for(const time of [132,165,200,249])assert.deepEqual(tracker.update([],time),initial);
 assert.equal(tracker.update([],250),null);
 assert.equal(tracker.update(pair().slice(0,1),270),null);
 assert.deepEqual(tracker.update(pair(),300),initial);
 const invalid=pair();invalid[0].landmarks[4].x=NaN;
 assert.equal(tracker.update(invalid,333),null);
 assert.equal(tracker.update([],350),null);
});

test('current closure cancels immediately and stale or reversed samples cannot retain a pose',()=>{
 const tracker=new PhotoPoseTracker();tracker.update(pair(),100);
 assert.equal(tracker.update([hand([.5,.5],[.5,.5]),hand([.5,.5],[.5,.5])],133),null);
 for(const time of [99,NaN,Infinity,1101]){
  tracker.update(pair(),100);assert.equal(tracker.update(pair(),time),null);
 }
 tracker.update(pair(),100);tracker.reset();assert.equal(tracker.update([],133),null);
});

test('duplicate timestamps and returned-object mutation never advance or corrupt pose smoothing',()=>{
 const tracker=new PhotoPoseTracker(),initial=tracker.update(pair(),0)!;
 assert.deepEqual(tracker.update(translated(.1),0),initial);
 const value=tracker.update(pair(),33)!;value.quad[0].x=.9;
 assert.deepEqual(tracker.update(pair(),33),initial);
});
