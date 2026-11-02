#!/usr/bin/env node
'use strict';

// Standalone geometric audit for Deepnest C&M placement snapshots.
// Input geometry must be source polygon trees before spacing offsets. This tool
// applies only the recorded rigid transform; it never applies spacing offsets.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const STATUS = { PASS: 'PASS', FAIL: 'FAIL', NOT: 'NOT_VERIFIED' };
function loadClipper() {
  const file = path.join(__dirname, '..', '..', 'main', 'util', 'clipper.js');
  const ctx = { navigator: { userAgent: 'node' } }; ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.ClipperLib;
}
function finitePoint(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function ringsOf(tree, out = []) {
  if (!tree || !Array.isArray(tree.points) || tree.points.length < 3 || !tree.points.every(finitePoint)) throw Error('Malformed contour');
  out.push(tree.points.map(p => ({ X: p.x, Y: p.y })));
  for (const child of (tree.children || [])) ringsOf(child, out);
  return out;
}
function transform(tree, place) {
  const theta = Number(place.rotation) * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
  const rec = n => ({ points: n.points.map(p => ({
    x: p.x * c - p.y * s + Number(place.x),
    y: p.x * s + p.y * c + Number(place.y)
  })), children: (n.children || []).map(rec) });
  if (![place.x, place.y, place.rotation].every(Number.isFinite)) throw Error('Non-finite placement transform');
  return rec(tree);
}
// Exact fallback for orientation signs. Fast double evaluation is used when its
// forward-error interval excludes zero; uncertain signs are evaluated as exact
// dyadic rationals represented by the input IEEE-754 numbers.
const floatBuffer = new ArrayBuffer(8), floatView = new DataView(floatBuffer);
function dyadic(x) {
  if (!Number.isFinite(x)) throw Error('Non-finite predicate input');
  if (x === 0) return { n: 0n, e: 0 };
  floatView.setFloat64(0, x, false);
  const hi = floatView.getUint32(0, false), lo = floatView.getUint32(4, false);
  const sign = hi >>> 31 ? -1n : 1n, exp = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (exp === 0) return { n: sign * frac, e: -1074 };
  return { n: sign * ((1n << 52n) | frac), e: exp - 1023 - 52 };
}
function dadd(a,b) { const e=Math.min(a.e,b.e); return {n:(a.n << BigInt(a.e-e))+(b.n << BigInt(b.e-e)),e}; }
function dsub(a,b) { return dadd(a,{n:-b.n,e:b.e}); }
function dmul(a,b) { return {n:a.n*b.n,e:a.e+b.e}; }
function exactOrientSign(a,b,c) {
  const ax=dyadic(a.x), ay=dyadic(a.y), bx=dyadic(b.x), by=dyadic(b.y), cx=dyadic(c.x), cy=dyadic(c.y);
  const det=dsub(dmul(dsub(bx,ax),dsub(cy,ay)),dmul(dsub(by,ay),dsub(cx,ax)));
  return det.n<0n?-1:det.n>0n?1:0;
}
function orientSign(a,b,c) {
  const x1=b.x-a.x, y1=b.y-a.y, x2=c.x-a.x, y2=c.y-a.y;
  const left=x1*y2, right=y1*x2, det=left-right;
  const err=(Math.abs(left)+Math.abs(right))*Number.EPSILON*4;
  if (Math.abs(det)>err) return det<0?-1:1;
  return exactOrientSign(a,b,c);
}
function onSeg(a,b,p) { return p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y); }
function segmentsIntersect(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
  const o1=orientSign(a,b,c),o2=orientSign(a,b,d),o3=orientSign(c,d,a),o4=orientSign(c,d,b);
  if(o1*o2<0&&o3*o4<0)return true;
  return (o1===0&&onSeg(a,b,c))||(o2===0&&onSeg(a,b,d))||(o3===0&&onSeg(c,d,a))||(o4===0&&onSeg(c,d,b));
}
function segmentBoxGap2(a,b,c,d) {
  const dx=Math.max(0,Math.min(a.x,b.x)-Math.max(c.x,d.x),Math.min(c.x,d.x)-Math.max(a.x,b.x));
  const dy=Math.max(0,Math.min(a.y,b.y)-Math.max(c.y,d.y),Math.min(c.y,d.y)-Math.max(a.y,b.y));
  return dx*dx+dy*dy;
}
function pointSegClosest(p,a,b) {
  const vx=b.x-a.x,vy=b.y-a.y,d=vx*vx+vy*vy;
  if(!Number.isFinite(d)||(d===0&&(vx!==0||vy!==0)))throw Error('Segment length underflow/overflow');
  const projection=(p.x-a.x)*vx+(p.y-a.y)*vy;
  const t=d?Math.max(0,Math.min(1,projection/d)):0;
  if(!Number.isFinite(t))throw Error('Non-finite segment projection');
  const q={x:a.x+t*vx,y:a.y+t*vy},dx=p.x-q.x,dy=p.y-q.y,d2=dx*dx+dy*dy;
  if(!Number.isFinite(d2)||(d2===0&&(dx!==0||dy!==0)))throw Error('Point-segment distance underflow/overflow');
  return {d2,q,t};
}
function ringEntries(tree) {
  const out=[];
  function visit(n,path) { out.push({index:out.length,path,points:n.points}); (n.children||[]).forEach((c,i)=>visit(c,path.concat(i))); }
  visit(tree,[]); return out;
}
function rotation(theta) { return {c:Math.cos(theta),s:Math.sin(theta)}; }
function rotatePoint(p,theta,cs=rotation(theta)) { return {x:p.x*cs.c-p.y*cs.s,y:p.x*cs.s+p.y*cs.c}; }
function relativeRingEntries(tree,anchor,offset,theta,cs) {
  return ringEntries(tree).map(r=>({index:r.index,path:r.path,points:r.points.map(p=>{
    const q=rotatePoint({x:p.x-anchor.x,y:p.y-anchor.y},theta,cs); return {x:q.x+offset.x,y:q.y+offset.y};
  })}));
}
function ulp(x) {
  if(!Number.isFinite(x))return Infinity;
  if(x===0)return Number.MIN_VALUE;
  floatView.setFloat64(0,Math.abs(x),false);
  let hi=floatView.getUint32(0,false),lo=floatView.getUint32(4,false);
  if(lo===0xffffffff){lo=0;hi++;}else lo++;
  floatView.setUint32(0,hi,false);floatView.setUint32(4,lo,false);
  return floatView.getFloat64(0,false)-Math.abs(x);
}
function distanceWitness(a,b,mmPerUnit) {
  const at=a.part.tree.points[0],bt=b.part.tree.points[0],pa=a.placement,pb=b.placement;
  const ta=Number(pa.rotation)*Math.PI/180,tb=Number(pb.rotation)*Math.PI/180;
  const dt={x:Number(pb.x)-Number(pa.x),y:Number(pb.y)-Number(pa.y)};
  const ca=rotation(ta),cb=rotation(tb);
  if(![ta,tb,ca.c,ca.s,cb.c,cb.s,dt.x,dt.y].every(Number.isFinite))throw Error('Non-finite relative transform');
  const ra=rotatePoint(at,ta,ca),rb=rotatePoint(bt,tb,cb);
  const offset={x:dt.x+rb.x-ra.x,y:dt.y+rb.y-ra.y};
  if(![offset.x,offset.y].every(Number.isFinite))throw Error('Relative transform overflow');
  const aa=relativeRingEntries(a.part.tree,at,{x:0,y:0},ta,ca),bb=relativeRingEntries(b.part.tree,bt,offset,tb,cb);
  let best=null,maxCoord=Math.max(Math.abs(dt.x),Math.abs(dt.y),Math.abs(offset.x),Math.abs(offset.y));
  for(const r of [...aa,...bb])for(const p of r.points)maxCoord=Math.max(maxCoord,Math.abs(p.x),Math.abs(p.y));
  for(const raEntry of aa)for(const rbEntry of bb)for(let i=0;i<raEntry.points.length;i++)for(let j=0;j<rbEntry.points.length;j++){
    const a0=raEntry.points[i],a1=raEntry.points[(i+1)%raEntry.points.length],b0=rbEntry.points[j],b1=rbEntry.points[(j+1)%rbEntry.points.length];
    const segmentLower2=segmentBoxGap2(a0,a1,b0,b1);
    if(best){const guard=64*Number.EPSILON*Math.max(segmentLower2,best.d2,Number.MIN_VALUE);if(segmentLower2>best.d2+guard)continue;}
    let d2,paNear,pbNear;
    if(segmentsIntersect(a0,a1,b0,b1)){d2=0;paNear=a0;pbNear=a0;}
    else {
      const candidates=[];
      for(const [p,s0,s1,side] of [[a0,b0,b1,'a0'],[a1,b0,b1,'a1'],[b0,a0,a1,'b0'],[b1,a0,a1,'b1']]){
        const q=pointSegClosest(p,s0,s1);
        candidates.push(side[0]==='a'?{d2:q.d2,pa:p,pb:q.q}:{d2:q.d2,pa:q.q,pb:p});
      }
      const nearest=candidates.reduce((x,y)=>y.d2<x.d2?y:x);d2=nearest.d2;paNear=nearest.pa;pbNear=nearest.pb;
    }
    if(!best||d2<best.d2)best={d2,paNear,pbNear,ringA:raEntry.index,ringB:rbEntry.index,ringPathA:raEntry.path,ringPathB:rbEntry.path,segmentA:i,segmentB:j};
  }
  if(!best)return null;
  const distanceUnits=Math.sqrt(best.d2),distanceMm=distanceUnits*mmPerUnit;
  // Bound arithmetic roundoff over local-coordinate construction, projection,
  // squared distance, sqrt and unit conversion. Translation ulps are included
  // because final placement coordinates may already have lost low bits before
  // serialization. Math.sin/cos are treated as the represented transform
  // coefficients; polygonization error is a separate source-geometry limit.
  const coordBound=128*Number.EPSILON*Math.max(maxCoord,Number.MIN_VALUE);
  const translationBound=ulp(Number(pa.x))+ulp(Number(pa.y))+ulp(Number(pb.x))+ulp(Number(pb.y));
  const transformBound=16*Number.EPSILON*(Math.abs(at.x)+Math.abs(at.y)+Math.abs(bt.x)+Math.abs(bt.y));
  const errorMm=(coordBound+translationBound+transformBound)*mmPerUnit+16*Number.EPSILON*Math.abs(distanceMm);
  if(!Number.isFinite(distanceMm)||!Number.isFinite(errorMm))throw Error('Distance or error interval overflow');
  return {distanceMm,errorBoundMm:errorMm,lowerMm:Math.max(0,distanceMm-errorMm),upperMm:distanceMm+errorMm,
    ringA:best.ringA,ringB:best.ringB,ringPathA:best.ringPathA,ringPathB:best.ringPathB,segmentA:best.segmentA,segmentB:best.segmentB,
    closestPointA:best.paNear,closestPointB:best.pbNear};
}
function minBoundaryDistanceMm(ta,tb,mmPerUnit) {
  // Kept for baseline benchmark; the production path uses distanceWitness.
  let d2=Infinity;const allA=[],allB=[];ringsOf(ta,allA);ringsOf(tb,allB);
  for(const aa of allA)for(const bb of allB)for(let i=0;i<aa.length;i++)for(let j=0;j<bb.length;j++){
    const a={x:aa[i].X,y:aa[i].Y},an={x:aa[(i+1)%aa.length].X,y:aa[(i+1)%aa.length].Y},b={x:bb[j].X,y:bb[j].Y},bn={x:bb[(j+1)%bb.length].X,y:bb[(j+1)%bb.length].Y};
    if(segmentsIntersect(a,an,b,bn))return 0;
    d2=Math.min(d2,pointSegClosest(a,b,bn).d2,pointSegClosest(an,b,bn).d2,pointSegClosest(b,a,an).d2,pointSegClosest(bn,a,an).d2);
  }
  return Math.sqrt(d2)*mmPerUnit;
}
function treeBounds(tree) {
  const b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  function visit(n){for(const p of n.points){b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);}for(const c of (n.children||[]))visit(c);}
  visit(tree);return b;
}
function boundsGapMm(a,b,mmPerUnit) {
  const dx=Math.max(0,a.minX-b.maxX,b.minX-a.maxX),dy=Math.max(0,a.minY-b.maxY,b.minY-a.maxY);
  return Math.hypot(dx,dy)*mmPerUnit;
}
function pathsFor(Clipper, trees, scale) {
  const paths=[];
  for(const t of trees) for(const ring of ringsOf(t)) {
    const p=ring.map(v=>({X:Math.round(v.X*scale),Y:Math.round(v.Y*scale)}));
    if(p.some(v=>!Number.isSafeInteger(v.X)||!Number.isSafeInteger(v.Y))) throw Error('Clipper coordinate outside safe integer range');
    paths.push(p);
  }
  return paths;
}
function overlayAreaMm2(Clipper, aTrees,bTrees, op, scale, mmPerUnit) {
  const c=new Clipper.Clipper(), subj=pathsFor(Clipper,aTrees,scale), clip=pathsFor(Clipper,bTrees,scale), solution=new Clipper.Paths();
  c.AddPaths(subj,Clipper.PolyType.ptSubject,true); c.AddPaths(clip,Clipper.PolyType.ptClip,true);
  c.Execute(op,solution,Clipper.PolyFillType.pftEvenOdd,Clipper.PolyFillType.pftEvenOdd);
  const unit=mmPerUnit/scale;
  return Math.abs(Clipper.JS.AreaOfPolygons(solution,1))*unit*unit;
}
function areaMm2(Clipper, trees, scale, mmPerUnit) {
  const paths=pathsFor(Clipper,trees,scale), a=Math.abs(Clipper.JS.AreaOfPolygons(paths,1));
  return a*(mmPerUnit/scale)**2;
}
function audit(input, Clipper, options={}) {
  const incidents={integrity:[],sheetLimits:[],overlaps:[],spacing:[],geometry:[]};
  const checks={}; let unknown=false, failed=false;
  const mark=(name, state, detail)=>{ checks[name]={status:state,...(detail?{detail}:{})}; if(state===STATUS.FAIL)failed=true; if(state===STATUS.NOT)unknown=true; };
  if(!input || input.schema!=='deepnest-cm-geometry-audit-input/v2' || input.coordinateSpace!=='deepnest-svg-units' || input.geometryStage!=='source-unoffset-polygon-tree' || !Array.isArray(input.parts) || input.parts.length===0 || !Array.isArray(input.sheets) || !Array.isArray(input.expectedInstances) || input.expectedInstances.length===0 || !Array.isArray(input.placements)) {
    mark('inputCompleteness',STATUS.NOT,'Se requiere schema v2 y manifiestos completos; v1 no codifica identidad física inequívoca.');
    return result(input||{},checks,incidents,STATUS.NOT,{});
  }
  mark('inputCompleteness',STATUS.PASS);
  const cfg=input.configuration||{}, scale=Number(cfg.clipperScale), unitsPerInch=Number(cfg.unitsPerInch), spacing=Number(cfg.spacingMm), margin=Number(cfg.sheetMarginMm||0);
  const validCfg=Number.isFinite(scale)&&scale>0&&Number.isFinite(unitsPerInch)&&unitsPerInch>0&&Number.isFinite(spacing)&&spacing>=0&&Number.isFinite(margin)&&margin>=0;
  if(!validCfg) { mark('geometry',STATUS.NOT,'Falta configuración válida de escala, unidades o separación.'); return result(input,checks,incidents,STATUS.NOT,{}); }
  const mmPerUnit=25.4/unitsPerInch, gridMm=mmPerUnit/scale, areaTolMm2=gridMm*gridMm;
  const catalog=new Map((input.parts||[]).map(p=>[Number(p.source),p]));
  let sourceGeometryBad=false; const sourceIds=new Set();
  for(const p of input.parts){
    try{if(!Number.isInteger(Number(p.source))||sourceIds.has(String(p.source)))throw Error('source inválido o duplicado');sourceIds.add(String(p.source));ringsOf(p.tree);}
    catch(e){sourceGeometryBad=true;incidents.geometry.push({source:p&&p.source,kind:'invalid_part_geometry',message:e.message});}
  }
  const sheetIds=new Set(), sheets=new Map(); let sheetIdentityBad=false;
  for(const s of input.sheets){
    try{
      if(!Number.isInteger(s.sheetid)||sheetIds.has(String(s.sheetid))||!Object.prototype.hasOwnProperty.call(s,'engineSheetId'))throw Error('diagnostic sheetid ausente/duplicado o engineSheetId no conservado');
      sheetIds.add(String(s.sheetid));sheets.set(String(s.sheetid),s);ringsOf(s.tree);
    }catch(e){sourceGeometryBad=true;sheetIdentityBad=true;incidents.geometry.push({sheetid:s&&s.sheetid,kind:'invalid_sheet_geometry_or_identity',message:e.message});}
  }
  mark('sourceGeometry',sourceGeometryBad?STATUS.NOT:STATUS.PASS,sourceGeometryBad?{issues:incidents.geometry.length}:undefined);
  const expected=input.expectedInstances||[], found=input.placements||[], counts=new Map();
  for(const p of found){
    const group=p&&sheets.get(String(p.sheetid));
    if(!p||!Number.isInteger(p.sheetid)||!Object.prototype.hasOwnProperty.call(p,'engineSheetId')||!group||p.engineSheetId!==group.engineSheetId) {sheetIdentityBad=true;incidents.geometry.push({id:p&&p.id,sheetid:p&&p.sheetid,kind:'placement_sheet_identity_unresolved'});}
  }
  mark('sheetIdentity',sheetIdentityBad?STATUS.NOT:STATUS.PASS,sheetIdentityBad?{issues:incidents.geometry.filter(x=>String(x.kind||'').includes('identity')).length,groupIds:sheetIds.size}: {groupIds:sheetIds.size});
  const seenExpected=new Set();
  for(const e of expected){const key=String(e.id);if(e.id===undefined||seenExpected.has(key))incidents.integrity.push({id:e.id,kind:'duplicate_or_missing_expected_id'});seenExpected.add(key);}
  for(const p of found) counts.set(String(p.id),(counts.get(String(p.id))||0)+1);
  const expIds=new Set(expected.map(p=>String(p.id)));
  for(const e of expected) {
    const n=counts.get(String(e.id))||0;
    if(n!==1) incidents.integrity.push({id:e.id,kind:n===0?'missing':'duplicate',count:n});
    const actual=found.filter(p=>String(p.id)===String(e.id));
    if(actual.some(p=>Number(p.source)!==Number(e.source))) incidents.integrity.push({id:e.id,kind:'source_mismatch',expectedSource:e.source,actualSources:actual.map(p=>p.source)});
  }
  for(const p of found) if(!expIds.has(String(p.id))) incidents.integrity.push({id:p.id,kind:'additional'});
  mark('integrity',incidents.integrity.length?STATUS.FAIL:STATUS.PASS,{expected:expected.length,found:found.length,missing:incidents.integrity.filter(x=>x.kind==='missing').length,duplicates:incidents.integrity.filter(x=>x.kind==='duplicate').length,additional:incidents.integrity.filter(x=>x.kind==='additional').length});
  const transformed=[]; let malformed=sourceGeometryBad||sheetIdentityBad;
  for(const p of found) {
    try {
      const part=catalog.get(Number(p.source)), sh=sheets.get(String(p.sheetid));
      if(!part||!part.tree||!sh||!sh.tree) throw Error(!part?'unknown source':'unresolved physical sheet geometry');
      transformed.push({placement:p,part,tree:transform(part.tree,p),sheet:sh});
    } catch(e) { malformed=true; incidents.geometry.push({id:p.id,message:e.message}); }
  }
  mark('transforms',malformed?STATUS.NOT:STATUS.PASS,malformed?{unverified:incidents.geometry.length}:undefined);
  if(malformed) unknown=true;
  const usedSheets=new Set(found.map(p=>String(p.sheetid)));
  let limitsUnknown=malformed;
  for(const x of transformed) {
    try {
      const area=overlayAreaMm2(Clipper,[x.tree],[x.sheet.tree],Clipper.ClipType.ctDifference,scale,mmPerUnit);
      // Sheet margin is checked by shrinking the usable region. A generic exact
      // inward offset is intentionally not guessed here; positive margin requires exported usable geometry.
      if(margin>0) { limitsUnknown=true; incidents.sheetLimits.push({id:x.placement.id,sheetid:x.placement.sheetid,kind:'margin_geometry_missing'}); }
      else if(area>areaTolMm2) incidents.sheetLimits.push({id:x.placement.id,sheetid:x.placement.sheetid,outsideAreaMm2:area});
      else if(area>0) { limitsUnknown=true; incidents.sheetLimits.push({id:x.placement.id,sheetid:x.placement.sheetid,kind:'within_quantization_tolerance',outsideAreaMm2:area}); }
    } catch(e) { limitsUnknown=true; incidents.sheetLimits.push({id:x.placement.id,kind:'geometry_error',message:e.message}); }
  }
  mark('sheetLimits',incidents.sheetLimits.some(x=>x.outsideAreaMm2>areaTolMm2)?STATUS.FAIL:limitsUnknown?STATUS.NOT:STATUS.PASS,{piecesChecked:transformed.length});
  let overlapUnknown=malformed, spacingUnknown=malformed, minGap=Infinity, minWitness=null;
  const spatialEnabled=options.spatial!==false, pairStats={sameSheetPairs:0,intersectionCalls:0,distanceCalls:0,skippedIntersectionByAabb:0,skippedDistanceByAabb:0};
  const bounds=spatialEnabled?transformed.map(x=>treeBounds(x.tree)):null; let nearestBoxI=-1,nearestBoxJ=-1,nearestBoxGap=Infinity;
  if(spatialEnabled) for(let i=0;i<transformed.length;i++) for(let j=i+1;j<transformed.length;j++) {
    const a=transformed[i],b=transformed[j]; if(String(a.placement.sheetid)!==String(b.placement.sheetid)) continue;
    const boxGap=boundsGapMm(bounds[i],bounds[j],mmPerUnit); pairStats.sameSheetPairs++;
    if(boxGap<nearestBoxGap){nearestBoxGap=boxGap;nearestBoxI=i;nearestBoxJ=j;}
  }
  if(spatialEnabled&&nearestBoxI>=0){
    try { minWitness=distanceWitness(transformed[nearestBoxI],transformed[nearestBoxJ],mmPerUnit); if(minWitness){minGap=minWitness.distanceMm;minWitness={...minWitness,idA:transformed[nearestBoxI].placement.id,idB:transformed[nearestBoxJ].placement.id,sheetid:transformed[nearestBoxI].placement.sheetid};pairStats.distanceCalls++;} }
    catch(e){spacingUnknown=true;incidents.geometry.push({a:transformed[nearestBoxI].placement.id,b:transformed[nearestBoxJ].placement.id,kind:'pair_distance_error',message:e.message});}
  }
  for(let i=0;i<transformed.length;i++) for(let j=i+1;j<transformed.length;j++) {
    const a=transformed[i],b=transformed[j]; if(String(a.placement.sheetid)!==String(b.placement.sheetid)) continue;
    if(!spatialEnabled)pairStats.sameSheetPairs++;
    const boxGap=spatialEnabled?boundsGapMm(bounds[i],bounds[j],mmPerUnit):0;
    const isNearest=spatialEnabled&&i===nearestBoxI&&j===nearestBoxJ;
    // Bounds in large world coordinates are themselves rounded. Widen the
    // broad-phase guard by a forward-error envelope before safely skipping.
    const worldMagnitude=spatialEnabled?Math.max(Math.abs(bounds[i].minX),Math.abs(bounds[i].maxX),Math.abs(bounds[i].minY),Math.abs(bounds[i].maxY),Math.abs(bounds[j].minX),Math.abs(bounds[j].maxX),Math.abs(bounds[j].minY),Math.abs(bounds[j].maxY)):0;
    const boxErrorMm=spatialEnabled?64*Number.EPSILON*worldMagnitude*mmPerUnit:0;
    const mayIntersect=!spatialEnabled||boxGap<=2*gridMm+boxErrorMm;
    if(mayIntersect){
      try {
        pairStats.intersectionCalls++;
        const overlap=overlayAreaMm2(Clipper,[a.tree],[b.tree],Clipper.ClipType.ctIntersection,scale,mmPerUnit);
        if(overlap>areaTolMm2)incidents.overlaps.push({a:a.placement.id,b:b.placement.id,sheetid:a.placement.sheetid,areaMm2:overlap});
        else if(overlap>0){overlapUnknown=true;incidents.geometry.push({a:a.placement.id,b:b.placement.id,kind:'overlap_below_quantization_tolerance',areaMm2:overlap});}
      }catch(e){overlapUnknown=true;incidents.geometry.push({a:a.placement.id,b:b.placement.id,kind:'overlap_geometry_error',message:e.message});}
    }else pairStats.skippedIntersectionByAabb++;
    const needDistance=!spatialEnabled||isNearest||boxGap<spacing+boxErrorMm||boxGap<minGap+boxErrorMm;
    if(needDistance){
      try {
        const witness=isNearest?minWitness:distanceWitness(a,b,mmPerUnit);
        if(!witness)throw Error('No boundary segments');
        if(!isNearest)pairStats.distanceCalls++;
        if(witness.distanceMm<minGap||!minWitness){minGap=witness.distanceMm;minWitness={...witness,idA:a.placement.id,idB:b.placement.id,sheetid:a.placement.sheetid};}
        if(witness.upperMm<spacing)incidents.spacing.push({a:a.placement.id,b:b.placement.id,sheetid:a.placement.sheetid,distanceMm:witness.distanceMm,requiredMm:spacing,errorBoundMm:witness.errorBoundMm,intervalMm:[witness.lowerMm,witness.upperMm]});
        else if(witness.lowerMm<spacing)spacingUnknown=true;
      }catch(e){spacingUnknown=true;incidents.geometry.push({a:a.placement.id,b:b.placement.id,kind:'pair_distance_error',message:e.message});}
    }else pairStats.skippedDistanceByAabb++;
  }
  const minimumSpacingStatus=incidents.spacing.length?STATUS.FAIL:spacingUnknown?STATUS.NOT:STATUS.PASS;
  mark('overlaps',incidents.overlaps.length?STATUS.FAIL:overlapUnknown?STATUS.NOT:STATUS.PASS,{pairsChecked:pairStats.sameSheetPairs,overlapPairs:incidents.overlaps.length});
  mark('minimumSpacing',minimumSpacingStatus,{configuredMm:spacing,measuredMm:Number.isFinite(minGap)?minGap:null,gridToleranceMm:2*gridMm});
  const state=failed?STATUS.FAIL:unknown?STATUS.NOT:STATUS.PASS;
  const minimumSpacingWitness=minWitness?{sheetid:minWitness.sheetid??null,pieceA:minWitness.idA??null,pieceB:minWitness.idB??null,ringA:minWitness.ringA,ringPathA:minWitness.ringPathA,segmentA:minWitness.segmentA,ringB:minWitness.ringB,ringPathB:minWitness.ringPathB,segmentB:minWitness.segmentB,distanceMm:minWitness.distanceMm,requiredMm:spacing,errorBoundMm:minWitness.errorBoundMm,intervalMm:[minWitness.lowerMm,minWitness.upperMm]}:null;
  const metrics={expectedPieces:expected.length,foundPlacements:found.length,usedSheets:usedSheets.size,configuredSpacingMm:spacing,minimumMeasuredSpacingMm:Number.isFinite(minGap)?minGap:null,minimumSpacingWitness,overlapPairs:incidents.overlaps.length,spacingViolations:incidents.spacing.length,outsidePieces:incidents.sheetLimits.filter(x=>x.outsideAreaMm2>areaTolMm2).length,gridToleranceMm:gridMm,areaToleranceMm2:areaTolMm2,spatialOptimization:{enabled:spatialEnabled,...pairStats}};
  return result(input,checks,incidents,state,metrics);
}
function result(input,checks,incidents,state,metrics){return {schema:'deepnest-cm-geometry-audit-report/v2',jobId:input.jobId??null,mode:input.mode??null,globalStatus:state,checks,metrics,incidents,limitations:['La geometría fuente es DeepNest.parts.polygontree: contornos poligonizados/limpiados por SvgParser antes de los offsets temporales; no se conserva aquí la curva SVG original. curveToleranceSourceUnits queda registrada.','Requiere geometría fuente sin compensación de spacing y transforms finales.','Las comparaciones por parejas usan solo el diagnostic sheetid del grupo físico; engineSheetId se conserva únicamente como dato diagnóstico.','Intersección/contención: Clipper existente; separación: distancia euclidiana JS entre todos los segmentos de contorno.','La cuantización Clipper puede hacer NOT_VERIFIED los casos próximos a la rejilla.','No valida defectos de máquina, kerf ni precisión física del material.']};}

function rect(x,y,w,h){return {points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],children:[]};}
function fixture(name,spacing,a,b,opts={}) {
  const parts=[{source:0,quantity:1,tree:a},{source:1,quantity:1,tree:b}];
  const base=opts.base||0; const expected=[{id:0,source:0},{id:1,source:1}], placements=[{id:0,source:0,x:base+(opts.ax||0),y:opts.ay||0,rotation:opts.ar||0,sheetid:0,engineSheetId:99},{id:1,source:1,x:base+(opts.bx||0),y:opts.by||0,rotation:opts.br||0,sheetid:0,engineSheetId:99}];
  if(opts.missing) placements.pop(); if(opts.duplicate) placements.push({...placements[0]}); if(opts.outside) placements[1].x=40;
  return {schema:'deepnest-cm-geometry-audit-input/v2',jobId:name,mode:'fixture',coordinateSpace:'deepnest-svg-units',geometryStage:'source-unoffset-polygon-tree',configuration:{unitsPerInch:25.4,clipperScale:opts.clipperScale||1000000,spacingMm:spacing,sheetMarginMm:0},parts,sheets:[{sheetid:0,engineSheetId:99,source:9,tree:rect(base-5,-5,40,40)}],expectedInstances:expected,placements};
}
function selfTest(Clipper){
  const cases=[]; const square=rect(0,0,1,1);
  const add=(name,input,want)=>{const r=audit(input,Clipper),ok=r.globalStatus===want; cases.push({name,want,got:r.globalStatus,ok,issues:r.incidents,checks:{overlaps:r.checks.overlaps.status,minimumSpacing:r.checks.minimumSpacing.status},witness:r.metrics.minimumSpacingWitness});};
  add('gap-0.50-exact-unresolved',fixture('gap-0.50',.5,square,square,{bx:1.5}),STATUS.NOT);
  add('overlap',fixture('overlap',0,square,square,{bx:.5}),STATUS.FAIL);
  add('tiny-overlap-near-collinear-predicate',fixture('tiny-overlap',0,rect(0,0,1e-7,1e-7),rect(0,0,1e-7,1e-7),{bx:5e-8,clipperScale:1e14}),STATUS.FAIL);
  add('distance-underflow-unverified',fixture('distance-underflow',.5,rect(0,0,1e-200,1e-200),rect(0,0,1e-200,1e-200),{bx:1}),STATUS.NOT);
  add('touch-only',fixture('touch-only',0,square,square,{bx:1}),STATUS.PASS);
  add('outside-sheet',fixture('outside-sheet',0,square,square,{bx:20,outside:true}),STATUS.FAIL);
  add('rotated',fixture('rotated',0,rect(0,0,2,1),square,{bx:5,br:45}),STATUS.PASS);
  const concave={points:[{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:1,y:1},{x:1,y:2},{x:0,y:2}],children:[]};
  add('concave',fixture('concave',0,concave,square,{bx:4}),STATUS.PASS);
  const donut={points:[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}],children:[{points:[{x:1,y:1},{x:1,y:4},{x:4,y:4},{x:4,y:1}],children:[]}]};
  add('piece-in-hole',fixture('piece-in-hole',.5,donut,square,{bx:2,by:2}),STATUS.PASS);
  add('duplicate-and-missing',fixture('duplicate-and-missing',0,square,square,{duplicate:true,missing:true}),STATUS.FAIL);
  add('gap-0.49',fixture('gap-0.49',.5,square,square,{bx:1.49}),STATUS.FAIL);
  add('gap-0.49999999',fixture('gap-0.49999999',.5,square,square,{bx:1.49999999}),STATUS.FAIL);
  add('gap-0.50-rotated-unresolved',fixture('gap-0.50-rotated',.5,square,square,{bx:1.5*Math.SQRT1_2,by:1.5*Math.SQRT1_2,ar:45,br:45}),STATUS.NOT);
  for(const [gap,want] of [[.49,STATUS.FAIL],[.49999999,STATUS.FAIL],[.5,STATUS.NOT],[.50000001,STATUS.PASS],[.51,STATUS.PASS]]) { const angle=45,span=1+gap; add(`rotated-gap-${gap}`,fixture(`rotated-gap-${gap}`,.5,square,square,{bx:span*Math.cos(angle*Math.PI/180),by:span*Math.sin(angle*Math.PI/180),ar:angle,br:angle}),want); }
  add('gap-0.50000001',fixture('gap-0.50000001',.5,square,square,{bx:1.50000001}),STATUS.PASS);
  add('gap-0.51',fixture('gap-0.51',.5,square,square,{bx:1.51}),STATUS.PASS);
  add('large-coordinates-unresolved',fixture('large-coordinates',.5,square,square,{base:1e9,bx:1.5}),STATUS.NOT);
  add('nonfinite-derived-rotation',fixture('nonfinite-derived-rotation',.5,square,square,{bx:1.5,ar:Number.MAX_VALUE}),STATUS.NOT);
  add('large-coordinates-0.49',fixture('large-coordinates-0.49',.5,square,square,{base:1e9,bx:1.49}),STATUS.FAIL);
  add('large-coordinates-0.49999999',fixture('large-coordinates-0.49999999',.5,square,square,{base:1e9,bx:1.49999999}),STATUS.NOT);
  add('large-coordinates-0.50000001',fixture('large-coordinates-0.50000001',.5,square,square,{base:1e9,bx:1.50000001}),STATUS.NOT);
  add('large-coordinates-0.51',fixture('large-coordinates-0.51',.5,square,square,{base:1e9,bx:1.51}),STATUS.PASS);
  return cases;
}
function main(){
  const Clipper=loadClipper(), args=process.argv.slice(2);
  if(args[0]==='--self-test'){const cases=selfTest(Clipper); for(const c of cases) console.log(`${c.ok?'PASS':'FAIL'} ${c.name}: ${c.got} (esperado ${c.want})`); if(cases.some(c=>!c.ok)) process.exitCode=1; return;}
  const inFile=args.find(a=>!a.startsWith('--')); if(!inFile){console.error('Uso: node tools/geometry-audit/audit.cjs snapshot.json [--output report.json] | --self-test');process.exitCode=2;return;}
  const input=JSON.parse(fs.readFileSync(inFile,'utf8')), report=audit(input,Clipper), oi=args.indexOf('--output');
  const json=JSON.stringify(report,null,2)+'\n'; if(oi>=0){const out=args[oi+1];if(!out)throw Error('--output requiere ruta');fs.writeFileSync(out,json,{flag:'wx'});}else process.stdout.write(json);
  if(report.globalStatus==='FAIL')process.exitCode=1;else if(report.globalStatus==='NOT_VERIFIED')process.exitCode=2;
}
if(require.main===module){try{main();}catch(e){console.error(`geometry-audit: ${e.stack||e}`);process.exitCode=2;}}
module.exports={audit,selfTest,loadClipper};
