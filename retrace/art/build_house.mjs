/** Original ReTrace architectural model. Metres, Y up, front +Z.
 * All geometry and material palettes authored for this preview. No external assets.
 * Generate: node art/build_house.mjs
 */
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// GLTFExporter uses the browser FileReader API for its binary container.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result=result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scene=new T.Scene(); scene.name='retrace_house_original';
const groups={};
for(const key of ['architecture','retrace_roof','cutaway_front','cutaway_right','furniture','landscape']){
  const g=new T.Group();g.name=key;scene.add(g);groups[key]=g;
}
const mat=(name,color,roughness=.75,extra={})=>new T.MeshStandardMaterial({name,color,roughness,...extra});
const M={
  plaster:mat('mineral_plaster',0xcac4b7,.95),
  concrete:mat('honed_limestone',0x9b978d,.89),
  mortar:mat('deep_joints',0x414443,.96),
  metal:mat('charcoal_powdercoat',0x20282b,.43,{metalness:.42}),
  roof:mat('weathered_charcoal_membrane',0x303635,.97),
  roofA:mat('membrane_subtle_wear',0x343a38,.96),
  roofB:mat('membrane_subtle_shade',0x2c3231,.98),
  oak:mat('warm_oak',0x86623e,.73),
  oakLight:mat('oak_light',0xa37d51,.78),
  cedar:mat('cedar_honey',0x8f5c37,.8),
  cedarDark:mat('cedar_dark',0x67452f,.86),
  cedarLight:mat('cedar_light',0xa16c41,.78),
  ivory:mat('woven_linen',0xccc5b2,.99),
  fabric:mat('oatmeal_upholstery',0xb4aa95,1),
  cushion:mat('clay_cushion',0x996a51,.98),
  rug:mat('woven_sand_rug',0x837e6f,1),
  black:mat('burnished_steel',0x242725,.45,{metalness:.65}),
  stone:mat('warm_white_stone',0xd1ccbf,.7),
  glass:mat('tinted_architectural_glass',0x8caaa3,.16,{metalness:.05,transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide}),
  green:mat('leaf_olive',0x3d4a32,.98),
  greenLight:mat('leaf_sage',0x586447,.98),
  earth:mat('garden_soil',0x34362e,1),
  brass:mat('brushed_brass',0x998060,.42,{metalness:.72}),
  lamp:mat('warm_luminous_diffuser',0xffe2aa,.7,{emissive:0xffb45c,emissiveIntensity:1.7}),
  lampOff:mat('unlit_interior_diffuser',0xa6a39a,.9),
  ceramic:mat('chalk_ceramic',0xb4b1a4,.6),
  books:mat('muted_book_spines',0x647270,.95),
};
const meshes=[];
function add(geo,material,position,parent='architecture',name='detail',rotation){
  const o=new T.Mesh(geo,material);o.position.set(...position);if(rotation)o.rotation.set(...rotation);
  o.name=name;o.castShadow=true;o.receiveShadow=true;groups[parent].add(o);meshes.push(o);return o;
}
function box(name,p,size,m,parent='architecture',bevel=.015,rot){
  const b=Math.min(bevel,...size.map(v=>v*.4));
  const geo=b>0?new RoundedBoxGeometry(...size,1,b):new T.BoxGeometry(...size);
  return add(geo,M[m],p,parent,name,rot);
}
function cyl(name,p,r,h,m,parent='furniture',rTop=r,segments=16){return add(new T.CylinderGeometry(rTop,r,h,segments,1),M[m],p,parent,name);}
function sphere(name,p,size,m,parent='furniture',segments=12){const o=add(new T.SphereGeometry(1,segments,8),M[m],p,parent,name);o.scale.set(...size);return o;}
function rod(name,a,b,r,m,parent='furniture',segments=8){
  const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av);
  const o=add(new T.CylinderGeometry(r,r,d.length(),segments),M[m],av.clone().add(bv).multiplyScalar(.5).toArray(),parent,name);
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
}
function lathe(name,p,profile,m,parent='furniture',segments=20){return add(new T.LatheGeometry(profile.map(a=>new T.Vector2(...a)),segments),M[m],p,parent,name);}

// Foundation, reveal, continuous interior floor. Courtyard is local landscape, no giant plane.
box('foundation_shadow_gap',[0,.1,0],[10.2,.2,7.6],'metal');
box('limestone_floor_edge',[0,.21,0],[10,.16,7.4],'concrete');
box('floor_underlay',[0,.285,0],[9.65,.018,7.04],'mortar',undefined,0);
for(let i=0;i<31;i++){
  let x=-4.68+i*.312;
  box('oak_floor_plank',[x,.302,0],[.303,.022,7.02],i%5===0?'oakLight':'oak','architecture',.002);
}
// Quiet solid rear/left walls, with a recessed rear band of oak cabinetry.
box('rear_mineral_wall',[0,1.79,-3.62],[10,2.96,.2],'plaster');
box('left_mineral_wall',[-4.9,1.79,0],[.2,2.96,7.4],'plaster');
box('left_baseboard',[-4.78,.36,0],[.04,.1,7.1],'oak');
box('rear_baseboard',[0,.36,-3.49],[9.6,.1,.04],'oak');
// Front facade: slender metal glazing at left, a recessed cedar entrance, solid right volume.
box('front_low_sill',[-2.56,.45,3.61],[4.52,.28,.24],'plaster','cutaway_front');
box('front_window_header',[-2.56,3.02,3.61],[4.52,.45,.24],'plaster','cutaway_front');
box('front_window_left_jamb',[-4.77,1.72,3.61],[.18,2.45,.24],'plaster','cutaway_front');
box('front_window_right_jamb',[-.34,1.72,3.61],[.18,2.45,.24],'plaster','cutaway_front');
for(let x of [-4.63,-2.51,-.49])box('glazing_mullion',[x,1.7,3.64],[.045,2.29,.09],'metal','cutaway_front',.005);
for(let y of [.58,2.82])box('glazing_rail',[-2.55,y,3.64],[4.22,.042,.09],'metal','cutaway_front',.004);
for(let x of [-3.57,-1.50])box('front_glass',[x,1.7,3.65],[2.05,2.2,.012],'glass','cutaway_front',0);
// Entrance bay and half-open pivot door (right hinge, swings inward).
box('entry_lintel',[.84,2.92,3.18],[2.02,.67,.35],'plaster','cutaway_front');
box('entry_left_pier',[-.13,1.53,3.3],[.22,2.46,.62],'cedarDark','cutaway_front');
box('entry_right_pier',[1.83,1.53,3.3],[.22,2.46,.62],'cedarDark','cutaway_front');
box('entry_side_light',[1.54,1.53,3.12],[.3,2.4,.015],'glass','cutaway_front',0);
for(let x of [.235,1.40])box('door_frame_vertical',[x,1.53,3.16],[.07,2.5,.14],'metal','cutaway_front',.005);
box('door_frame_top',[.815,2.77,3.16],[1.23,.065,.14],'metal','cutaway_front',.005);
box('door_threshold',[.815,.33,3.16],[1.23,.04,.28],'stone','cutaway_front',.008);
// A right hinge makes the 42-degree opening legible from the front-right hero camera.
const doorAngle=-.73;
const doorX=1.38-Math.cos(doorAngle)*.54, doorZ=3.15+Math.sin(doorAngle)*.54;
box('half_open_oak_door',[doorX,1.52,doorZ],[1.08,2.36,.075],'cedar','cutaway_front',.012,[0,doorAngle,0]);
for(let j=0;j<7;j++){
 const lx=-.46+j*.151;
 box('door_grain_joint',[doorX+Math.cos(doorAngle)*lx+Math.sin(doorAngle)*.04,1.52,doorZ-Math.sin(doorAngle)*lx+Math.cos(doorAngle)*.04],[.006,2.30,.003],'cedarDark','cutaway_front',0,[0,doorAngle,0]);
}
const hx=doorX-Math.cos(doorAngle)*.39+Math.sin(doorAngle)*.061,hz=doorZ+Math.sin(doorAngle)*.39+Math.cos(doorAngle)*.061;
box('vertical_entry_pull',[hx,1.39,hz],[.025,.39,.035],'brass','cutaway_front',.006,[0,doorAngle,0]);
box('warm_entry_soffit',[.81,2.79,3.45],[1.8,.025,.65],'oak','cutaway_front');
box('entry_luminous_recess',[.81,2.765,3.44],[.76,.007,.035],'lamp','cutaway_front',0);
box('interior_entry_light_recess',[.81,2.755,2.88],[1.10,.007,.025],'lampOff','cutaway_front',0);
// Right facade volume, subtly irregular vertical cedar cladding.
box('front_right_backing',[3.41,1.76,3.61],[3.16,2.92,.22],'cedarDark','cutaway_front');
for(let i=0;i<25;i++)box('front_cedar_batten',[1.91+i*.124,1.76,3.76],[.077,2.92,.10],i%5===1?'cedarLight':i%3===0?'cedarDark':'cedar','cutaway_front',.008);
box('right_wall',[4.9,1.76,0],[.2,2.92,7.4],'plaster','cutaway_right');
for(let i=0;i<30;i++)box('right_cedar_batten',[5.03,1.76,-.1+i*.125],[.1,2.92,.078],i%5===1?'cedarLight':i%3===0?'cedarDark':'cedar','cutaway_right',.008);
// Two restrained cylindrical entry sconces; light itself belongs to host scene.
for(let x of [-.12,1.84]){
 cyl('entry_sconce',[x,2.07,3.67],.052,.23,'metal','cutaway_front',.052,12);
 cyl('entry_sconce_diffuser',[x,1.948,3.67],.042,.01,'lamp','cutaway_front',.042,12);
}
// Shallow folded roof and warm cedar soffit. All roof parts share one lift group.
box('roof_slab',[0,3.245,0],[10.52,.18,7.9],'metal','retrace_roof',.022);
box('roof_top_cap',[0,3.341,0],[10.47,.025,7.86],'roof','retrace_roof',.008);
// Large quiet membrane courses and restrained welded joints; no bright tiled roof.
for(let i=0;i<8;i++){
 const x=-4.55+i*1.3;
 box('roof_membrane_course',[x,3.356,0],[1.29,.008,7.64],i%3===0?'roofA':i%3===1?'roof':'roofB','retrace_roof',.002);
 if(i<7)box('roof_welded_seam',[x+.646,3.362,0],[.009,.009,7.64],'roofB','retrace_roof',.002);
}
for(let z of [-3.88,3.88])box('roof_perimeter_coping',[0,3.387,z],[10.49,.065,.12],'metal','retrace_roof',.013);
for(let x of [-5.185,5.185])box('roof_perimeter_coping',[x,3.387,0],[.12,.065,7.70],'metal','retrace_roof',.013);
box('ceiling',[0,3.12,0],[9.66,.045,7.04],'plaster','retrace_roof',.002);
box('front_roof_soffit',[0,3.132,3.72],[10.4,.035,.36],'cedar','retrace_roof',.006);
for(let z of [-2,0,2])for(let x of [-3,0,3])cyl('recessed_ceiling_lens',[x,3.083,z],.055,.006,'lampOff','retrace_roof',.055,12);
// Deep exterior roof fascia shows a controlled continuous edge.
box('front_roof_drip',[0,3.22,3.952],[10.55,.24,.026],'metal','retrace_roof',.003);
box('right_roof_drip',[5.266,3.22,0],[.026,.24,7.9],'metal','retrace_roof',.003);
// Lounge: upholstered three-seat sofa along left wall, loose cushions, round tables, rug.
box('living_rug',[-2.51,.326,.52],[3.88,.018,3.08],'rug','furniture',.035);
for(let k=0;k<26;k++)box('rug_weave_edge',[-2.51,.338,-.93+k*.115],[3.8,.0015,.012],'ivory','furniture',0);
box('sofa_plinth',[-4.02,.45,.5],[1.19,.20,2.91],'oak','furniture',.03);
box('sofa_base',[-4.0,.61,.5],[1.17,.25,2.93],'fabric','furniture',.095);
box('sofa_back',[-4.50,.95,.5],[.23,.85,2.9],'fabric','furniture',.09);
for(let z of [-.39,.5,1.39]){
 box('sofa_seat',[-3.91,.785,z],[.91,.22,.87],'ivory','furniture',.09);
 box('sofa_back_cushion',[-4.29,1.04,z],[.24,.62,.87],'ivory','furniture',.075,[0,0,-.13]);
}
for(let z of [-.97,1.97])box('sofa_arm',[-4.00,.86,z],[1.17,.61,.18],'fabric','furniture',.07);
box('clay_throw_cushion',[-4.06,1.03,-.57],[.24,.43,.43],'cushion','furniture',.09,[.17,.17,-.24]);
box('sage_throw_cushion',[-4.03,1.03,1.55],[.25,.44,.43],'books','furniture',.09,[-.12,0,-.26]);
cyl('travertine_coffee_top',[-2.37,.71,.4],.69,.09,'stone','furniture',.69,40);
cyl('coffee_pedestal',[-2.37,.51,.4],.26,.30,'oak','furniture',.22,24);
cyl('side_table_top',[-3.92,.85,-1.39],.31,.06,'oak','furniture',.31,24);
cyl('side_table_leg',[-3.92,.57,-1.39],.055,.51,'black');
cyl('side_table_base',[-3.92,.328,-1.39],.22,.02,'black');
box('coffee_book',[-2.51,.772,.36],[.31,.037,.24],'books','furniture',.003,[0,.18,0]);
box('coffee_book_pages',[-2.51,.786,.36],[.285,.012,.218],'ivory','furniture',.001,[0,.18,0]);
lathe('coffee_ceramic_bowl',[-2.13,.76,.67],[[.09,0],[.125,.025],[.14,.065],[.133,.069],[.118,.03],[.09,.015]],'ceramic');
// Low lounge chair on curved upholstered shells and angled legs.
box('chair_seat',[-.82,.73,.15],[.73,.16,.79],'cushion','furniture',.09,[0,-.32,0]);
box('chair_back',[-.66,1.05,-.19],[.76,.68,.15],'cushion','furniture',.09,[-.15,-.32,0]);
for(let sx of [-1,1])for(let sz of [-1,1])rod('chair_splayed_leg',[-.82+sx*.28,.66,.15+sz*.28],[-.82+sx*.36,.32,.15+sz*.36],.025,'oak');
// Floor lamp: slim stem, broad fabric shade, warm underside.
cyl('reading_lamp_base',[-4.0,.335,2.49],.22,.035,'black');
cyl('reading_lamp_stem',[-4.0,1.09,2.49],.018,1.49,'black');
cyl('reading_lamp_shade',[-4.0,1.77,2.49],.30,.34,'ivory','furniture',.21,32);
cyl('reading_lamp_glow',[-4.0,1.598,2.49],.282,.008,'lampOff','furniture',.282,32);
// Dining: rounded oak table, four sculpted chairs, ceramic vase.
box('dining_table_top',[-2.26,1.07,-2.48],[1.88,.085,1.08],'oakLight','furniture',.15);
for(let x of [-2.91,-1.61])for(let z of [-2.80,-2.16])rod('dining_table_leg',[x,1.025,z],[x+(x<-2.26?-.07:.07),.32,z+(z<-2.48?-.05:.05)],.045,'oak');
function diningChair(x,z,rot){
 const base=new T.Group();base.position.set(x,0,z);base.rotation.y=rot;
 const all=[]; const prior=meshes.length;
 box('dining_chair_seat',[0,.775,0],[.51,.10,.48],'fabric','furniture',.05);
 box('dining_chair_back',[0,1.065,-.20],[.50,.47,.07],'oak','furniture',.065,[.10,0,0]);
 for(let dx of [-.19,.19])for(let dz of [-.17,.17])rod('dining_chair_leg',[dx,.73,dz],[dx*1.12,.32,dz*1.22],.023,'oak');
 for(let o of meshes.slice(prior)){o.updateMatrix();o.applyMatrix4(new T.Matrix4().makeRotationY(rot));o.position.add(new T.Vector3(x,0,z));}
}
diningChair(-2.76,-1.73,0);diningChair(-1.76,-1.73,0);diningChair(-2.76,-3.19,Math.PI);diningChair(-1.76,-3.19,Math.PI);
lathe('dining_vase',[-2.23,1.115,-2.48],[[.08,0],[.115,.09],[.10,.18],[.05,.26],[.045,.31]],'ceramic');
for(let i=0;i<5;i++){let ex=-2.23+Math.sin(i*2)*.19,ez=-2.48+Math.cos(i*2)*.15;rod('vase_branch',[-2.23,1.34,-2.48],[ex,1.65+i*.025,ez],.004,'cedarDark');sphere('vase_leaf',[ex,1.59+i*.025,ez],[.065,.025,.04],'green','furniture',8);}
// Kitchen, right rear. Toe kick, oak fronts, stone worktop and backsplash.
box('kitchen_toekick',[2.85,.40,-3.02],[3.42,.18,.50],'metal','furniture');
box('kitchen_base',[2.85,.78,-3.04],[3.42,.65,.70],'oak','furniture',.015);
box('kitchen_counter',[2.85,1.14,-3.01],[3.52,.075,.81],'stone','furniture',.018);
box('backsplash',[2.85,1.51,-3.485],[3.52,.69,.032],'stone','furniture',.005);
for(let x of [1.48,2.16,2.84,3.52,4.20]){
 box('oak_cabinet_front',[x,.785,-2.677],[.65,.615,.026],'oakLight','furniture',.006);
 box('cabinet_pull',[x,1.01,-2.642],[.28,.015,.022],'black','furniture',.003);
}
box('hob',[3.64,1.187,-2.97],[.59,.014,.51],'black','furniture',.016);
for(let x of [3.49,3.80])for(let z of [-3.11,-2.84])cyl('hob_ring',[x,1.197,z],.105,.003,'metal','furniture',.105,24);
box('sink_recess',[1.81,1.184,-3.01],[.51,.008,.42],'metal','furniture',.07);
rod('faucet_stem',[1.81,1.19,-3.29],[1.81,1.54,-3.29],.018,'brass');
rod('faucet_spout',[1.81,1.54,-3.29],[1.81,1.54,-3.05],.018,'brass');
box('open_shelf',[2.85,2.18,-3.2],[3.48,.045,.45],'oak','furniture',.008);
box('under_shelf_glow',[2.85,2.148,-3.10],[3.30,.01,.018],'lampOff','furniture',.001);
for(let x of [1.5,1.72,3.90,4.15])lathe('shelf_crock',[x,2.205,-3.25],[[.06,0],[.09,.03],[.09,.16],[.07,.18]],'ceramic');
// Island with stools; offsets retain clear entrance circulation.
box('island_base',[3.1,.76,-.8],[1.86,.87,.72],'oak','furniture',.035);
box('island_stone_top',[3.1,1.22,-.75],[2.12,.07,1.1],'stone','furniture',.025);
for(let x of [2.55,3.65]){
 cyl('stool_seat',[x,.97,.12],.23,.07,'oak','furniture',.23,24);
 for(let dx of [-.15,.15])for(let dz of [-.15,.15])rod('stool_leg',[x+dx,.935,.12+dz],[x+dx*1.35,.32,.12+dz*1.35],.019,'metal');
 rod('stool_footrest',[x-.2,.5,.32],[x+.2,.5,.32],.012,'metal');
}
lathe('island_bowl',[3.48,1.26,-.70],[[.11,0],[.18,.03],[.21,.11],[.202,.12],[.175,.05],[.11,.02]],'ceramic');
// Entry console and a domestic detail, no screen or sensing equipment claim.
box('entry_console',[3.58,1.00,2.52],[1.84,.08,.45],'oak','furniture',.018);
for(let x of [2.80,4.36])for(let z of [2.36,2.66])box('console_leg',[x,.66,z],[.035,.64,.035],'metal','furniture',.006);
lathe('entry_vase',[3.90,1.045,2.50],[[.09,0],[.13,.12],[.11,.25],[.05,.34]],'ceramic');
box('entry_catchall',[4.16,1.06,2.57],[.24,.035,.16],'stone','furniture',.035);
// Geometric framed abstract art, muted and domestic.
box('art_frame',[-4.766,1.89,.40],[.035,.9,1.36],'oak');
box('art_canvas',[-4.744,1.89,.40],[.012,.82,1.28],'ivory');
box('art_clay_field',[-4.735,1.95,.14],[.009,.48,.53],'cushion');
box('art_charcoal_field',[-4.731,1.72,.63],[.009,.25,.56],'books');
// Courtyard: floating stepping slabs and a broad porch slab at the threshold.
box('entry_porch',[.79,.18,4.12],[2.24,.30,1.40],'concrete','landscape',.035);
box('porch_shadow',[.79,.039,4.12],[2.12,.036,1.27],'metal','landscape',.015);
for(let i=0;i<5;i++)box('path_stepping_slab',[.79,.037,5.09+i*.64],[1.67,.075,.53],'concrete','landscape',.025);
// Low stone garden beds and planted grasses/olive shrubs.
box('left_planting_bed',[-2.52,.105,4.18],[3.77,.16,.98],'mortar','landscape',.03);
box('left_planting_soil',[-2.52,.197,4.18],[3.63,.035,.84],'earth','landscape',.025);
box('right_planting_bed',[3.51,.15,4.18],[2.66,.28,.98],'concrete','landscape',.03);
box('right_planting_soil',[3.51,.30,4.18],[2.50,.035,.83],'earth','landscape',.025);
function grass(x,z,s,base=.21){
 for(let k=0;k<12;k++){
  const a=k*2.399, h=(.29+(k%4)*.05)*s,r=.13*s;
  const verts=new Float32Array([x-.008,base,z,x+.008,base,z,x+Math.cos(a)*r,base+h,z+Math.sin(a)*r]);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(verts,3));g.computeVertexNormals();
  const o=add(g,M[k%2?'green':'greenLight'],[0,0,0],'landscape','ornamental_grass');o.material.side=T.DoubleSide;
 }
}
for(let x of [-3.98,-3.25,-2.50,-1.75,-1.06])grass(x,4.17,1.1);
for(let x of [2.48,3.12,3.8,4.46])grass(x,4.17,1.4,.32);
// A low planted edge follows the right facade; sparse clusters soften the hard footprint.
box('side_garden_edge',[5.22,.09,.78],[.075,.18,6.05],'metal','landscape',.009);
box('side_garden_soil',[5.48,.028,.78],[.45,.05,6.04],'earth','landscape',.018);
for(let i=0;i<6;i++)grass(5.42,-1.73+i*.99,.74,.06);
for(let p of [[-1.52,4.24],[2.40,4.16],[4.54,4.13]]){
 sphere('low_garden_shrub',[p[0],.45,p[1]],[.24,.18,.24],'green','landscape',10);
 sphere('low_garden_shrub_tip',[p[0]+.11,.50,p[1]-.07],[.17,.16,.17],'greenLight','landscape',10);
}
// Small multi-stem olive at left, airy leaf masses (far below eaves).
cyl('olive_planter',[-4.80,.35,4.63],.39,.68,'concrete','landscape',.47,24);
cyl('olive_soil',[-4.8,.699,4.63],.43,.015,'earth','landscape',.43,24);
for(let i=0;i<3;i++){
 const xx=-4.8+Math.sin(i*2.1)*.15,zz=4.63+Math.cos(i*2.1)*.15;
 rod('olive_trunk',[-4.8,.69,4.63],[xx,1.9,zz],.026,'cedarDark','landscape');
 for(let j=0;j<4;j++){
  const a=j*1.8+i,ex=xx+Math.cos(a)*.38,ez=zz+Math.sin(a)*.35,ey=1.35+j*.21;
  rod('olive_branch',[xx,ey-.16,zz],[ex,ey,ez],.011,'cedarDark','landscape');
  // Individual narrow olive leaves avoid toy-like spherical foliage masses.
  for(let leaf=0;leaf<18;leaf++){
   const angle=leaf*2.399+i, radius=.10+(leaf%4)*.043;
   const shape=new T.Shape();shape.moveTo(0,-.07);shape.quadraticCurveTo(.036,0,0,.07);shape.quadraticCurveTo(-.036,0,0,-.07);
   const foliage=add(new T.ShapeGeometry(shape,3),M[leaf%3?'green':'greenLight'],[ex+Math.cos(angle)*radius,ey+.04+(leaf%5)*.035,ez+Math.sin(angle)*radius],'landscape','olive_leaf');
   foliage.rotation.set(.5+leaf*.37,angle,.3*Math.sin(leaf));
  }
 }
}

// Merge by animation group/material to keep draw calls practical. Facades and roof stay distinct.
let triangles=0,sourceMeshes=meshes.length;
for(const group of Object.values(groups)){
 const buckets=new Map();
 for(const child of [...group.children]){
  child.updateMatrix();
  const g=child.geometry.clone().applyMatrix4(child.matrix);
  // Normalize attribute layouts so simple grass and standard surfaces can be merged.
  const geometry=g.index?g.toNonIndexed():g;
  geometry.deleteAttribute('uv');
  const key=child.material.uuid;
  if(!buckets.has(key))buckets.set(key,{material:child.material,geometries:[]});
  buckets.get(key).geometries.push(geometry);group.remove(child);
 }
 for(const {material,geometries} of buckets.values()){
  const geo=mergeGeometries(geometries,false);
  geo.computeBoundingBox();geo.computeBoundingSphere();
  triangles+=geo.getAttribute('position').count/3;
  const m=new T.Mesh(geo,material);m.name=`${group.name}_${material.name}`;m.castShadow=true;m.receiveShadow=true;group.add(m);
 }
}
scene.userData={author:'Original geometry authored for ReTrace local concept preview',license:'Original project asset; no third-party source assets',units:'metres',up:'Y',front:'+Z',floorHeight:.313,doorCenter:[.815,1.52,3.15],conceptOnly:true};
const glb=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true,trs:false});
await fs.writeFile(path.join(ROOT,'public/models/retrace-home.glb'),Buffer.from(glb));
const report={format:'glTF 2.0 binary',bytes:glb.byteLength,triangles,sourceMeshes,drawMeshes:Object.values(groups).reduce((n,g)=>n+g.children.length,0),groups:Object.keys(groups),units:'metres',up:'Y',front:'+Z',bounds:new T.Box3().setFromObject(scene).getSize(new T.Vector3()).toArray(),geometryBounds:{min:new T.Box3().setFromObject(scene).min.toArray(),max:new T.Box3().setFromObject(scene).max.toArray()},materials:Object.values(M).map(m=>m.name),provenance:'All geometry authored in art/build_house.mjs. No imported models, textures, HDRIs, code, or paid generation.',generator:'Three.js GLTFExporter under Node 24 in the cloud executor; original procedural geometry and no third-party assets.'};
await fs.writeFile(path.join(ROOT,'art/asset-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
