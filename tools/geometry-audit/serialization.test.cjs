'use strict';
const assert = require('node:assert/strict');
const { createSnapshot, getSelectedNest } = require('./snapshot.cjs');
const { audit, loadClipper } = require('./audit.cjs');
const box = (x,y,w,h,children=[]) => Object.assign([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}], {children});
const parts = [
  {sheet:false,quantity:2,polygontree:box(0,0,10,10,[box(2,2,2,2)])},
  {sheet:true,quantity:1,polygontree:box(-5,-5,100,100)}
];
const nest={placements:[{sheet:1,sheetid:0,sheetplacements:[{id:0,source:0,x:10,y:10,rotation:90},{id:1,source:0,x:30,y:10,rotation:0}]}]};
const before=JSON.stringify({parts,nest});
const snapshot=createSnapshot({jobId:42,mode:'fast',parts,nest,configuration:{scale:72,clipperScale:1e7,spacing:0.5,curveTolerance:.3}});
assert.equal(JSON.stringify({parts,nest}),before,'serialización sin mutar geometría ni posiciones');
assert.equal(snapshot.schema,'deepnest-cm-geometry-audit-input/v2');
assert.equal(snapshot.expectedInstances.length,2);
assert.deepEqual(snapshot.expectedInstances,[{id:0,source:0},{id:1,source:0}]);
assert.equal(snapshot.parts[0].tree.children.length,1,'preserva huecos/árbol hijo');
assert.equal(snapshot.placements[0].rotation,90);
assert.equal(snapshot.configuration.spacingMm,0.5*25.4/72);
assert.equal(snapshot.configuration.sheetMarginMm,0);
assert.equal(snapshot.geometryStage,'source-unoffset-polygon-tree');
assert.equal(snapshot.sheets[0].sheetid,0);
assert.equal(snapshot.sheets[0].engineSheetId,0);
const normal=createSnapshot({jobId:43,mode:'off',parts,nest,configuration:{scale:25.4,clipperScale:1e7,spacing:0,curveTolerance:.3}});
assert.equal(normal.mode,'off');
assert.equal(normal.configuration.spacingMm,0);
const Clipper=loadClipper();
assert.equal(audit({},Clipper).globalStatus,'NOT_VERIFIED','rechaza snapshot ausente o incompleto');
assert.equal(audit({...snapshot,schema:'deepnest-cm-geometry-audit-input/v1'},Clipper).globalStatus,'NOT_VERIFIED','no reinterpreta snapshots antiguos');
const dup={...snapshot,placements:[...snapshot.placements,{...snapshot.placements[0]}]};
assert.equal(audit(dup,Clipper).checks.integrity.status,'FAIL','detecta id duplicado');
const missing={...snapshot,placements:snapshot.placements.slice(0,1)};
assert.equal(audit(missing,Clipper).checks.integrity.status,'FAIL','detecta instancia faltante');
assert.throws(()=>createSnapshot({jobId:1,mode:'off',parts:[{sheet:false,quantity:1,polygontree:null}],nest,configuration:{scale:72,clipperScale:1e7,spacing:0,curveTolerance:.3}}),/Geometría ausente/);
assert.throws(()=>createSnapshot({jobId:1,mode:'off',parts,nest:{placements:[{sheet:1,sheetid:0,sheetplacements:[{id:0,source:0,x:0,y:0,rotation:NaN}]}]},configuration:{scale:72,clipperScale:1e7,spacing:0,curveTolerance:.3}}),/Transformación/);
assert.throws(()=>createSnapshot({jobId:1,mode:'invalid',parts,nest,configuration:{scale:72,clipperScale:1e7,spacing:0,curveTolerance:.3}}),/Identidad o modo/);

// Regression: 100 virtual sheets were repeated references and their engine id
// collapsed to 99. Physical result groups remain distinct in schema v2.
const sharedSheet=parts[1].polygontree, virtualSheets=Array(100).fill(sharedSheet);
for(let i=0;i<virtualSheets.length;i++)virtualSheets[i].id=i;
assert(virtualSheets.every(s=>s===sharedSheet));
assert.equal(new Set(virtualSheets.map(s=>s.id)).size,1);
assert.equal(virtualSheets[0].id,99);
const batchParts=[{sheet:false,quantity:100,polygontree:box(0,0,1,1)},{sheet:true,quantity:1,polygontree:box(-2,-2,25,5)}];
function groupedNest(groupCount){let id=0;const placements=[];for(let g=0;g<groupCount;g++){const count=Math.floor(100/groupCount)+(g<100%groupCount?1:0),sheetplacements=[];for(let j=0;j<count;j++){sheetplacements.push({id,source:0,x:j*2,y:0,rotation:0});id++;}placements.push({sheet:1,sheetid:99,sheetplacements});}return {placements};}
for(const groupCount of [10,11]){
  const grouped=createSnapshot({jobId:70+groupCount,mode:'fast',parts:batchParts,nest:groupedNest(groupCount),configuration:{scale:25.4,clipperScale:1e7,spacing:.5,curveTolerance:.3}});
  assert.equal(grouped.sheets.length,groupCount);
  assert.equal(new Set(grouped.sheets.map(s=>s.sheetid)).size,groupCount,'IDs físicos únicos');
  assert(grouped.sheets.every(s=>s.engineSheetId===99),'ID original conservado solo para diagnóstico');
  assert(grouped.placements.every(p=>p.engineSheetId===99));
  const report=audit(grouped,Clipper);
  assert.equal(report.globalStatus,'PASS');
  assert.equal(report.metrics.usedSheets,groupCount);
  const withinGroup=grouped.placements.reduce((n,p)=>n+grouped.placements.filter(q=>q.sheetid===p.sheetid&&q.id>p.id).length,0);
  assert.equal(report.checks.overlaps.detail.pairsChecked,withinGroup,'no compara piezas entre grupos');
  assert.equal(report.metrics.overlapPairs,0);
  assert.equal(report.metrics.spacingViolations,0);
  if(groupCount===11){
    const ambiguous={...grouped,placements:grouped.placements.map(p=>{const copy={...p};delete copy.sheetid;return copy;})};
    assert.equal(audit(ambiguous,Clipper).globalStatus,'NOT_VERIFIED','no inventa asociación física sin diagnostic sheetid');
  }
}
const sameSheet=groupedNest(10);sameSheet.placements[0].sheetplacements[1].x=0;
const collision=createSnapshot({jobId:80,mode:'fast',parts:batchParts,nest:sameSheet,configuration:{scale:25.4,clipperScale:1e7,spacing:.5,curveTolerance:.3}});
assert.equal(audit(collision,Clipper).checks.overlaps.status,'FAIL','conserva colisiones dentro de la hoja');
const tooClose=groupedNest(10);tooClose.placements[0].sheetplacements[1].x=1.49;
const spacingFail=createSnapshot({jobId:81,mode:'fast',parts:batchParts,nest:tooClose,configuration:{scale:25.4,clipperScale:1e7,spacing:.5,curveTolerance:.3}});
const spacingReport=audit(spacingFail,Clipper);
assert.equal(spacingReport.checks.minimumSpacing.status,'FAIL','detecta gap 0.49 mm');
assert.deepEqual({sheetid:spacingReport.metrics.minimumSpacingWitness.sheetid,pieceA:spacingReport.metrics.minimumSpacingWitness.pieceA,pieceB:spacingReport.metrics.minimumSpacingWitness.pieceB},{sheetid:0,pieceA:0,pieceB:1},'registra testigo mínimo con hoja y piezas');
assert(Number.isInteger(spacingReport.metrics.minimumSpacingWitness.segmentA)&&Number.isInteger(spacingReport.metrics.minimumSpacingWitness.segmentB));
assert(spacingReport.metrics.minimumSpacingWitness.intervalMm[1]<0.5,'el intervalo confirma el gap insuficiente');
const selectedA={selected:true,placements:[{sheet:1,sheetid:99,sheetplacements:[{id:0,source:0,x:0,y:0,rotation:0}]}]};
const selectedB={selected:true,placements:[{sheet:1,sheetid:99,sheetplacements:[{id:0,source:0,x:2,y:0,rotation:90}]},{sheet:1,sheetid:99,sheetplacements:[{id:1,source:0,x:4,y:0,rotation:0}]}]};
const selectedNest=getSelectedNest([selectedA,selectedB]);
assert.equal(selectedNest,[selectedA,selectedB].filter(n=>n.selected).pop(),'usa la misma selección que exportNest');
const selectedSnapshot=createSnapshot({jobId:82,mode:'fast',parts:batchParts,nest:selectedNest,configuration:{scale:25.4,clipperScale:1e7,spacing:0,curveTolerance:.3}});
assert.equal(selectedSnapshot.placements.length,2,'snapshot contiene los grupos del resultado seleccionado');
assert.equal(selectedSnapshot.sheets.length,selectedNest.placements.length,'grupos snapshot corresponden a grupos exportables SVG');
assert.deepEqual(selectedSnapshot.placements.map(p=>p.sheetid),[0,1]);
assert.deepEqual(selectedSnapshot.placements.map(p=>p.rotation),[90,0]);
console.log('PASS v2 snapshot groups, legacy rejection, 100 aliases, 10/11 sheets, same-sheet collisions/spacing, selection and serialization');
