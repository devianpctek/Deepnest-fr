/* C&M Designs: independent, persistent nesting snapshot archive.
   Archives SVG previews; never restores or modifies DeepNest optimizer state. */
(function(){
'use strict';
const KEY='cm-nesting-history-v1';
const $=id=>document.getElementById(id);
const t=(es,en)=>typeof window.cmV110Text==='function'?window.cmV110Text(es,en):es;
const read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const write=a=>localStorage.setItem(KEY,JSON.stringify(a));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getSelected=()=>{const n=window.DeepNest&&DeepNest.nests;return Array.isArray(n)?n.find(x=>x&&x.selected&&Array.isArray(x.placements)&&x.placements.length):null};
function snapshot(){
 const selected=getSelected(), svg=$('nestdisplay')?.querySelector('svg');
 if(!selected||!svg)throw Error(t('No hay un acomodo válido para guardar.','There is no valid nest to save.'));
 const serialized=new XMLSerializer().serializeToString(svg);
 if(!serialized.includes('<svg'))throw Error(t('No se pudo obtener el SVG.','Could not get the SVG.'));
 const sheets=selected.placements.length;
 const placed=selected.placements.reduce((n,p)=>n+(p.sheetplacements||[]).length,0);
 const summary=$('cm-cost-summary');
 const costs=summary&&!summary.hidden?summary.innerText.trim():'';
 return {id:Date.now()+'-'+Math.random().toString(36).slice(2,8),name:'',date:new Date().toISOString(),sheets,placed,costs,svg:serialized};
}
function save(){
 try{
  const item=snapshot();
  const nameBox=$('cm-history-name'),savePanel=$('cm-history-save-wrap');
  if(!nameBox||!savePanel)throw Error(t('No se encontró el formulario de guardado.','The save form could not be found.'));
  nameBox.value=t('Anidado ','Nest ')+new Date().toLocaleString(t('es-MX','en-US'));
  savePanel.hidden=false;
  $('cm-history-dialog').hidden=false;
  $('cm-history-save-confirm').onclick=()=>{
   try{
    item.name=(nameBox.value.trim()||t('Anidado sin nombre','Unnamed nest')).slice(0,100);
    const all=read();all.unshift(item);if(all.length>30)all.length=30;
    write(all);savePanel.hidden=true;show();
   }catch(e){window.alert(t('No se pudo guardar: ','Could not save: ')+e.message);}
  };
  nameBox.focus();nameBox.select();
 }catch(e){window.alert(t('No se pudo guardar el anidado: ','Could not save the nest: ')+e.message);}
}

function download(item){
 const blob=new Blob([item.svg],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(item.name.replace(/[^a-z0-9áéíóúüñ _-]/gi,'').trim()||'anidado')+'.svg';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function show(){
 const dialog=$('cm-history-dialog'),list=$('cm-history-list');if(!dialog||!list)return;
 const all=read();list.replaceChildren();
 if(!all.length){list.textContent=t('Todavía no hay anidados guardados.','No saved nests yet.');}
 all.forEach(item=>{
  const card=document.createElement('div');card.className='cm-history-entry';
  const heading=document.createElement('div');heading.className='cm-history-entry-title';heading.textContent=item.name;
  const details=document.createElement('div');details.className='cm-history-entry-meta';
  details.textContent=new Date(item.date).toLocaleString(t('es-MX','en-US'))+' · '+item.placed+' '+t('piezas','parts')+' · '+item.sheets+' '+t('hojas','sheets');
  const actions=document.createElement('div');actions.className='cm-history-entry-actions';
  [[t('Ver','View'),()=>preview(item)],[t('Exportar SVG','Export SVG'),()=>download(item)],[t('Eliminar','Delete'),()=>{if(confirm(t('¿Eliminar este anidado guardado?','Delete this saved nest?'))){write(read().filter(x=>x.id!==item.id));show();}}]].forEach(([label,action])=>{
   const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);actions.appendChild(b);
  });card.append(heading,details,actions);list.appendChild(card);
 });
 dialog.hidden=false;
}
function preview(item){
 const viewer=$('cm-history-preview'),label=$('cm-history-preview-title'),stats=$('cm-history-preview-stats');
 if(!viewer)return;
 label.textContent=item.name;
 stats.textContent=new Date(item.date).toLocaleString(t('es-MX','en-US'))+' · '+item.placed+' '+t('piezas','parts')+' · '+item.sheets+' '+t('hojas','sheets')+(item.costs?'\n'+item.costs:'');
 // Sandboxed iframe isolates archived SVG from the live application.
 viewer.setAttribute('sandbox','');viewer.srcdoc='<!doctype html><html><head><style>body{margin:0;background:#25272a;display:flex;align-items:center;justify-content:center;min-height:100vh}svg{max-width:96vw;max-height:75vh;width:auto;height:auto}</style></head><body>'+item.svg+'</body></html>';
 $('cm-history-preview-wrap').hidden=false;
}
function init(){
 const top=$('nest')?.querySelector('.topnav');if(!top)return;
 const saveButton=document.createElement('button');saveButton.id='cm-save-nest';saveButton.type='button';
 const historyButton=document.createElement('button');historyButton.id='cm-open-history';historyButton.type='button';
 // Put controls at the end of toolbar, not inside the export dropdown.
 top.append(saveButton,historyButton);
 saveButton.addEventListener('click',save);historyButton.addEventListener('click',show);
 const dialog=document.createElement('div');dialog.id='cm-history-dialog';dialog.hidden=true;
 dialog.innerHTML='<div class="cm-history-window" role="dialog" aria-modal="true"><header><strong id="cm-history-heading"></strong><button type="button" id="cm-history-close"></button></header><p id="cm-history-description"></p><div id="cm-history-save-wrap" hidden><label for="cm-history-name" id="cm-history-name-label"></label><input id="cm-history-name" maxlength="100"/><button type="button" id="cm-history-save-confirm"></button><button type="button" id="cm-history-save-cancel"></button></div><div id="cm-history-list"></div><section id="cm-history-preview-wrap" hidden><h3 id="cm-history-preview-title"></h3><iframe id="cm-history-preview"></iframe><pre id="cm-history-preview-stats"></pre><button type="button" id="cm-history-preview-close"></button></section></div>';
 document.body.appendChild(dialog);
 function updateLanguage(){
  saveButton.textContent=t('Guardar anidado','Save nest');historyButton.textContent=t('Historial','History');
  dialog.setAttribute('aria-label',t('Historial de anidados','Nesting history'));
  $('cm-history-heading').textContent=t('Historial de anidados','Nesting history');
  $('cm-history-close').textContent=t('Cerrar','Close');
  $('cm-history-description').textContent=t('Copias guardadas para consulta y exportación. No modifican el anidado actual.','Saved copies for review and export. They do not change the current nest.');
  $('cm-history-name-label').textContent=t('Nombre del anidado','Nest name');
  $('cm-history-save-confirm').textContent=t('Guardar','Save');$('cm-history-save-cancel').textContent=t('Cancelar','Cancel');
  $('cm-history-preview').title=t('Vista previa del SVG guardado','Preview of saved SVG');
  $('cm-history-preview-close').textContent=t('Cerrar vista previa','Close preview');
  if(!dialog.hidden) show();
 }
 updateLanguage();
 document.addEventListener('cm-interface-language-updated',updateLanguage);
 $('cm-history-save-cancel').onclick=()=>{$('cm-history-save-wrap').hidden=true;};
 $('cm-history-close').onclick=()=>{dialog.hidden=true;$('cm-history-save-wrap').hidden=true;$('cm-history-preview-wrap').hidden=true;$('cm-history-preview').srcdoc='';};
 $('cm-history-preview-close').onclick=()=>{$('cm-history-preview-wrap').hidden=true;$('cm-history-preview').srcdoc='';};
 dialog.addEventListener('click',e=>{if(e.target===dialog)$('cm-history-close').click()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
