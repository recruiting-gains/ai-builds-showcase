import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMap } from '../src/handframe/surface';
import { projectFrame } from '../src/handframe/perspective';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('projective texture corners match all four surface corners for neutral and both depth directions',()=>{
  for(const depth of [-1,0,1])for(const roll of [-.4,0,.4]){
    const pose=projectFrame({x:.25,y:.25,width:.5,height:.5},depth,roll),map=surfaceMap(pose.quad);
    [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=map(u,v);close(p.x,pose.quad[i].x);close(p.y,pose.quad[i].y);});
  }
});
test('perspective keeps texture grid lines straight and finite throughout the surface',()=>{
  const {quad}=projectFrame({x:.2,y:.2,width:.6,height:.6},.8,.3),map=surfaceMap(quad);
  for(const fixed of [0,.2,.5,.8,1])for(const horizontal of [true,false]){
    const a=horizontal?map(0,fixed):map(fixed,0),b=horizontal?map(1,fixed):map(fixed,1);
    for(let i=0;i<=20;i++){
      const p=horizontal?map(i/20,fixed):map(fixed,i/20);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
      close((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x),0);
    }
  }
});
test('neutral texture center stays centered and collapsed or crossed surfaces are rejected',()=>{
  const pose=projectFrame({x:.2,y:.3,width:.4,height:.3},0,0),p=surfaceMap(pose.quad)(.5,.5);close(p.x,.4);close(p.y,.45);
  assert.throws(()=>surfaceMap([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),RangeError);
  assert.throws(()=>surfaceMap([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]),RangeError);
  assert.throws(()=>surfaceMap([{x:NaN,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]),RangeError);
});
