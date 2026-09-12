import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { HandOutlineTracker } from '../src/handframe/hand-outline';
import { PerspectiveTracker } from '../src/handframe/perspective';
import { WorldCycle } from '../src/handframe/world-cycle';
import { handOutlineFixture, opposingLFixture } from './hand-outline-fixtures';
import { worldCyclePair } from './world-cycle-fixtures';

// Same physical geometry expressed in another source image aspect. Render x/y
// remain normalized; z, like x, is measured in fractions of image width.
const atAspect=(hands:Hand[],aspect:number)=>hands.map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({
  ...p,x:.5+(p.x-.5)*(16/9)/aspect,z:p.z===undefined?undefined:p.z*(16/9)/aspect,
}))}));
for(const aspect of [9/16,3/4,1,4/3,16/9]){
 test(`open and inverted hand apertures track at source aspect ${aspect}`,()=>{
  for(const pair of [handOutlineFixture('rectangle',{scale:.35}),opposingLFixture('right',{scale:.35})]){
   const mapped=atAspect(pair,aspect), tracker=new HandOutlineTracker();
   const result=tracker.update(mapped,0,aspect);assert.ok(result);
   const pose=new PerspectiveTracker().update(mapped,result.rect,0,true,aspect);assert.ok(pose);
   assert.equal(pose.depth,0);assert.ok(result.outline.length>=4);
  }
 });
 test(`close/reopen switches exactly once at source aspect ${aspect}`,()=>{
  const cycle=new WorldCycle();
  const pair=(separation:number)=>atAspect(worldCyclePair(separation,{scale:.35}),aspect);
  assert.equal(cycle.update(pair(3.2),0,aspect),false);
  assert.equal(cycle.update(pair(3.2),120,aspect),false);
  assert.equal(cycle.status,'open');
  assert.equal(cycle.update(pair(1.1),160,aspect),false);
  assert.equal(cycle.update(pair(1.1),320,aspect),false);
  assert.equal(cycle.status,'closed');
  assert.equal(cycle.update(pair(3.2),360,aspect),false);
  assert.equal(cycle.update(pair(3.2),480,aspect),true);
  assert.equal(cycle.update(pair(3.2),600,aspect),false);
 });
}

test('invalid camera aspect clears geometry and cycling without a synthetic gesture',()=>{
 for(const aspect of [NaN,Infinity,0,-1]){
  const pair=handOutlineFixture(),shape=new HandOutlineTracker();
  const formed=shape.update(pair,0)!;assert.ok(formed);
  assert.equal(shape.update(pair,16,aspect),null);
  assert.equal(new PerspectiveTracker().update(pair,formed.rect,0,true,aspect),null);
  const cycle=new WorldCycle();cycle.update(worldCyclePair(3.2),0);cycle.update(worldCyclePair(3.2),120);
  assert.equal(cycle.update(worldCyclePair(1.1),140,aspect),false);assert.equal(cycle.status,'waiting-open');
 }
});
