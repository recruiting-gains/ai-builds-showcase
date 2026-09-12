import test from 'node:test';
import assert from 'node:assert/strict';
import { photoHandPose } from '../src/handframe/photo-pose';
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
