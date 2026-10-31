/* C&M Designs — read-only material utilization and costing. */
(function(){
'use strict';
const config = require('electron-settings');
const currency = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const number = n => new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(n);
function polygonArea(poly){
 if(!Array.isArray(poly)||poly.length<3)return NaN;
 let sum=0;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  if(!a||!b||!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Number.isFinite(b.x)||!Number.isFinite(b.y))return NaN;
  sum+=a.x*b.y-b.x*a.y;
 }
 return Math.abs(sum)/2;
}
function treeArea(poly,sign=1){
 const outer=polygonArea(poly);
 if(!Number.isFinite(outer))return NaN;
 let total=sign*outer;
 if(Array.isArray(poly.children))for(const child of poly.children){
  const sub=treeArea(child,-sign);
  if(!Number.isFinite(sub))return NaN;
  total+=sub;
 }
 return total;
}
function partArea(part){
 if(!part||!part.polygontree)return NaN;
 const a=treeArea(part.polygontree);
 return Number.isFinite(a)&&a>0?a:NaN;
}
function calculate(selected,parts){
 let sheetCount=0,pieceCount=0,validPieces=0,totalArea=0,usedArea=0,fullCost=0,proportionalCost=0,pricedSheets=0;
 for(const placement of selected.placements){
  const sheet=parts[placement.sheet],area=partArea(sheet);
  if(!(area>0))continue;
  sheetCount++;totalArea+=area;
  let occupied=0;
  for(const placed of (placement.sheetplacements||[])){
   pieceCount++;
   const piece=partArea(parts[placed.source]);
   if(Number.isFinite(piece)&&piece>0){occupied+=piece;validPieces++;}
  }
  usedArea+=occupied;
  const price=sheet&&sheet.cmSheetCost;
  if(typeof price==='number'&&Number.isFinite(price)&&price>=0){
   pricedSheets++;fullCost+=price;proportionalCost+=price*Math.min(1,occupied/area);
  }
 }
 return {sheetCount,pieceCount,validPieces,totalArea,usedArea,fullCost,proportionalCost,pricedSheets};
}
function render(){
 const el=document.getElementById('cm-cost-summary');
 if(!el)return;
 const all=window.nest&&typeof window.nest.get==='function'?window.nest.get('nests'):null;
 const selected=Array.isArray(all)?all.find(n=>n&&n.selected&&Array.isArray(n.placements)&&n.placements.length):null;
 const parts=window.DeepNest&&window.DeepNest.parts;
 if(!selected||!Array.isArray(parts)){el.hidden=true;el.innerHTML='';return;}
 const x=calculate(selected,parts);
 if(!x.sheetCount||!x.totalArea){el.hidden=true;el.innerHTML='';return;}
 const lang=(document.documentElement.lang||'es').toLowerCase();
 const en=lang.startsWith('en') && config.getSync('interfaceLanguage')==='en';
 const t=en?{
  title:'Material utilization and costs',sheets:'Sheets used',pieces:'Parts placed',occupied:'Piece area (approx.)',free:'Remaining area (approx.)',full:'Full sheet cost',proportional:'Proportional material cost',missing:'Partial cost: some sheets have no registered price.',uncertain:'Some shapes could not be measured. Areas and proportional costs may be incomplete.',foot:'Area excludes piece holes where available; spacing, kerf and usable remnant shapes are not included. No inventory deduction.'
 }:{
  title:'Aprovechamiento y costos',sheets:'Hojas utilizadas',pieces:'Piezas acomodadas',occupied:'Área de piezas (aprox.)',free:'Área restante (aprox.)',full:'Costo de hojas completas',proportional:'Costo proporcional del material',missing:'Costo parcial: hay hojas sin precio registrado.',uncertain:'No se pudieron medir algunas figuras; las áreas y el costo proporcional podrían estar incompletos.',foot:'El área considera huecos de las piezas cuando existen; no incluye separación, ancho de corte ni forma de sobrantes reutilizables. No descuenta inventario.'
 };
 const scale=Number(config.getSync('scale'));
 const mm2=scale>0?Math.pow(25.4/scale,2):NaN;
 const asArea=n=>Number.isFinite(mm2)?number(n*mm2/100)+' cm²':'—';
 const utilization=Math.min(100,Math.max(0,100*x.usedArea/x.totalArea));
 const row=(name,value)=>'<div class="cm-cost-row"><span>'+name+'</span><strong>'+value+'</strong></div>';
 const html='<h2>'+t.title+'</h2><div class="cm-cost-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+utilization.toFixed(1)+'"><span style="width:'+utilization.toFixed(2)+'%"></span></div><div class="cm-cost-percent">'+number(utilization)+'%</div>'+
 row(t.sheets,String(x.sheetCount))+row(t.pieces,String(x.pieceCount))+row(t.occupied,asArea(x.usedArea))+row(t.free,asArea(Math.max(0,x.totalArea-x.usedArea)))+
 row(t.full,x.pricedSheets?currency(x.fullCost)+(x.pricedSheets<x.sheetCount?' *':''):'—')+
 row(t.proportional,x.pricedSheets?currency(x.proportionalCost)+(x.pricedSheets<x.sheetCount?' *':''):'—')+
 (x.pricedSheets<x.sheetCount?'<p class="cm-cost-warning">* '+t.missing+'</p>':'')+
 (x.validPieces<x.pieceCount?'<p class="cm-cost-warning">'+t.uncertain+'</p>':'')+
 '<p class="cm-cost-foot">'+t.foot+'</p>';
 if(el.innerHTML!==html)el.innerHTML=html;
 el.hidden=false;
}
document.addEventListener('DOMContentLoaded',()=>{
 render();
 const interval=setInterval(render,1000);
 window.addEventListener('beforeunload',()=>clearInterval(interval));
});
})();
