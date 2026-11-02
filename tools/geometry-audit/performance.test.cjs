'use strict';
const assert=require('node:assert/strict');
const {audit,loadClipper}=require('./audit.cjs');
const C=loadClipper();
const vertices=24,parts=[],expectedInstances=[],placements=[];
function ring(radius){const p=[];for(let k=0;k<vertices;k++){const a=2*Math.PI*k/vertices;p.push({x:radius*Math.cos(a),y:radius*Math.sin(a)});}return {points:p,children:[]};}
for(let id=0;id<100;id++){
  parts.push({source:id,quantity:1,kind:'part',tree:ring(1)});expectedInstances.push({id,source:id});
  placements.push({id,source:id,x:3+(id%10)*4,y:3+Math.floor(id/10)*4,rotation:(id%4)*90,sheetid:0,engineSheetId:99});
}
const input={schema:'deepnest-cm-geometry-audit-input/v2',jobId:900,mode:'fast',coordinateSpace:'deepnest-svg-units',geometryStage:'source-unoffset-polygon-tree',configuration:{unitsPerInch:25.4,clipperScale:1e7,spacingMm:.5,sheetMarginMm:0},parts,sheets:[{sheetid:0,engineSheetId:99,source:100,tree:{points:[{x:-3,y:-3},{x:45,y:-3},{x:45,y:45},{x:-3,y:45}],children:[]}}],expectedInstances,placements};
function semantics(r){return {globalStatus:r.globalStatus,checks:Object.fromEntries(Object.entries(r.checks).map(([k,v])=>[k,v.status])),expectedPieces:r.metrics.expectedPieces,foundPlacements:r.metrics.foundPlacements,usedSheets:r.metrics.usedSheets,overlapPairs:r.metrics.overlapPairs,spacingViolations:r.metrics.spacingViolations,outsidePieces:r.metrics.outsidePieces,incidents:r.incidents};}
function once(spatial){const before=process.memoryUsage().heapUsed,t0=process.hrtime.bigint(),report=audit(input,C,{spatial}),ms=Number(process.hrtime.bigint()-t0)/1e6,after=process.memoryUsage().heapUsed;return {ms,heapDelta:after-before,report};}
for(let i=0;i<1;i++){once(false);once(true);}
const baseline=[],optimized=[];
for(let i=0;i<5;i++){baseline.push(once(false));optimized.push(once(true));}
for(let i=0;i<5;i++)assert.deepEqual(semantics(baseline[i].report),semantics(optimized[i].report),'resultados geométricos deben ser idénticos');
function summary(rows){const xs=rows.map(x=>x.ms).sort((a,b)=>a-b),mem=rows.map(x=>x.heapDelta).sort((a,b)=>a-b),med=xs[2];return {medianMs:med,minMs:xs[0],maxMs:xs.at(-1),madMs:xs.map(x=>Math.abs(x-med)).sort((a,b)=>a-b)[2],medianHeapDeltaBytes:mem[2]};}
const b=summary(baseline),o=summary(optimized),counters=optimized[0].report.metrics.spatialOptimization;
assert.equal(optimized[0].report.globalStatus,'PASS');
assert.equal(counters.sameSheetPairs,4950);
assert.equal(baseline[0].report.metrics.spatialOptimization.intersectionCalls,4950);
assert.equal(baseline[0].report.metrics.spatialOptimization.distanceCalls,4950);
assert(counters.skippedIntersectionByAabb>4800);

console.log(JSON.stringify({fixture:{pieces:100,sheets:1,verticesPerContour:vertices,spacingMm:.5,engineSheetId:99},warmups:1,repetitions:5,baseline:b,spatial:o,speedup:b.medianMs/o.medianMs,baselineCounters:baseline[0].report.metrics.spatialOptimization,spatialCounters:counters,semanticResultsEquivalent:true,witness:optimized[0].report.metrics.minimumSpacingWitness},null,2));
