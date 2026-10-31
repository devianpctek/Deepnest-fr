/* C&M Designs v1.0.1 — local materials; no stock writes or network access. */
(function(){
'use strict';
const settings=require('electron-settings');
const KEY='cmMaterialsV101', SELECTED='cmSelectedMaterialV101';
const seed=[{id:'acrilico-espejo-600x400',name:'Acrílico espejo',width:600,height:400,thickness:'',cost:199}];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
let materials=[],selected='';
try{const stored=settings.getSync(KEY);materials=Array.isArray(stored)?stored:seed.slice();}catch(e){materials=seed.slice();}
try{selected=settings.getSync(SELECTED)||materials[0]?.id||'';}catch(e){selected=materials[0]?.id||'';}
function persist(){settings.setSync(KEY,materials);settings.setSync(SELECTED,selected);}
function render(){
 const sel=$('cm-mat-select');if(!sel)return;
 sel.innerHTML=materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} — ${m.width} × ${m.height} mm</option>`).join('');
 if(!materials.some(m=>m.id===selected))selected=materials[0]?.id||'';
 sel.value=selected;
 const m=materials.find(x=>x.id===selected);
 $('cm-mat-detail').textContent=m?`${m.width} × ${m.height} mm${m.thickness?' · '+m.thickness+' mm':''} · ${money(m.cost)} / ${t('perSheet')}`:t('none');
 $('cm-mat-apply').disabled=!m;
 $('cm-mat-edit').disabled=!m;
 $('cm-mat-delete').disabled=!m;
 updateCost();
}
function lang(){return settings.getSync('interfaceLanguage')==='en'?'en':'es';}
const labels={
 es:{rect:'Rectángulo',materials:'Materiales',create:'Crear hoja',add:'Agregar',edit:'Editar',remove:'Eliminar',name:'Nombre',width:'Ancho (mm)',height:'Alto (mm)',thickness:'Grosor (mm, opcional)',cost:'Costo por hoja (MXN)',save:'Guardar',cancel:'Cancelar',none:'Sin materiales',perSheet:'por hoja',local:'Biblioteca local · sin movimientos de inventario.',created:'Hoja creada y marcada.',noNest:'Sin resultado de anidado seleccionado.',partial:'Costo parcial: hay hojas utilizadas sin precio registrado.',used:'hojas utilizadas',total:'Costo total',noStock:'Sin descontar inventario.',invalid:'Revisa nombre, medidas, grosor y costo.',notReady:'Deepnest aún no está listo.',exists:'Ya existe una hoja. El modo automático requiere una sola plantilla.',failed:'No se pudo crear la hoja.',mark:'Se agregó el rectángulo. Márcalo como hoja antes de anidar.',deleteConfirm:'¿Eliminar este material?',yes:'Eliminar',confirmTitle:'Confirmar eliminación'},
 en:{rect:'Rectangle',materials:'Materials',create:'Create sheet',add:'Add',edit:'Edit',remove:'Delete',name:'Name',width:'Width (mm)',height:'Height (mm)',thickness:'Thickness (mm, optional)',cost:'Cost per sheet (MXN)',save:'Save',cancel:'Cancel',none:'No materials',perSheet:'per sheet',local:'Local library · no inventory movements.',created:'Sheet created and marked.',noNest:'No nesting result selected.',partial:'Partial cost: one or more used sheets have no recorded price.',used:'sheets used',total:'Total cost',noStock:'No inventory deducted.',invalid:'Check name, dimensions, thickness and cost.',notReady:'Deepnest is not ready yet.',exists:'A sheet already exists. Automatic mode requires one template sheet.',failed:'Could not create the sheet.',mark:'Rectangle created. Mark it as a sheet before nesting.',deleteConfirm:'Delete this material?',yes:'Delete',confirmTitle:'Confirm deletion'}
};
function t(key){return labels[lang()][key];}
let editingId=null, deletePending=false, noticeTimer=null;
function notice(message){
 const el=$('cm-mat-status');if(!el)return;
 clearTimeout(noticeTimer);el.textContent=message;el.hidden=!message;
 if(message)noticeTimer=setTimeout(()=>{el.textContent='';el.hidden=true;},3200);
}
function closeEditor(){$('cm-mat-editor').hidden=true;deletePending=false;}
function editMaterial(existing){
 editingId=existing?existing.id:null;deletePending=false;
 $('cm-mat-editor').hidden=false;
 $('cm-mat-form').hidden=false;
 $('cm-mat-delete-confirm').hidden=true;
 $('cm-mat-name').value=existing?.name||'';
 $('cm-mat-width').value=existing?.width||600;
 $('cm-mat-height').value=existing?.height||400;
 $('cm-mat-thickness').value=existing?.thickness||'';
 $('cm-mat-cost').value=existing?.cost??0;
 $('cm-mat-error').textContent='';
 $('cm-mat-name').focus();
}
function saveMaterial(){
 const name=$('cm-mat-name').value.trim(),w=Number($('cm-mat-width').value),h=Number($('cm-mat-height').value),
 thickness=$('cm-mat-thickness').value.trim(),costText=$('cm-mat-cost').value.trim(),c=Number(costText);
 if(!name||!(w>0)||!(h>0)||!Number.isFinite(w)||!Number.isFinite(h)||costText===''||!Number.isFinite(c)||c<0||(thickness!==''&&!(Number(thickness)>0))){$('cm-mat-error').textContent=t('invalid');return;}
 const existing=materials.find(m=>m.id===editingId);
 if(existing)Object.assign(existing,{name,width:w,height:h,thickness,cost:c});
 else {const id='local-'+Date.now().toString(36);materials.push({id,name,width:w,height:h,thickness,cost:c});selected=id;}
 persist();closeEditor();render();notice(lang()==='es'?'Material guardado.':'Material saved.');
}
function confirmDelete(){
 $('cm-mat-editor').hidden=false;$('cm-mat-form').hidden=true;$('cm-mat-delete-confirm').hidden=false;
}
function deleteMaterial(){materials=materials.filter(x=>x.id!==selected);selected=materials[0]?.id||'';persist();closeEditor();render();notice(lang()==='es'?'Material eliminado.':'Material deleted.');}
function translateUI(){
 const pairs={'cm-tab-rect':'rect','cm-tab-materials':'materials','cm-mat-apply':'create','cm-mat-add':'add','cm-mat-edit':'edit','cm-mat-delete':'remove','cm-mat-label-name':'name','cm-mat-label-width':'width','cm-mat-label-height':'height','cm-mat-label-thickness':'thickness','cm-mat-label-cost':'cost','cm-mat-save':'save','cm-mat-cancel':'cancel','cm-mat-delete-title':'deleteConfirm','cm-mat-delete-yes':'yes','cm-mat-delete-no':'cancel'};
 for(const [id,key] of Object.entries(pairs)){if($(id))$(id).textContent=t(key);}
 $('cm-mat-local').hidden=true;

 const price=$('cm-rectangle-price');if(price)price.placeholder=lang()==='en'?'Optional':'Opcional';
 render();
}
function setTab(tab){
 const rect=tab==='rect';
 $('rectangledialog').style.display=rect?'block':'none';
 $('cm-materials-panel').style.display=rect?'none':'block';
 $('cm-tab-rect').classList.toggle('selected',rect);
 $('cm-tab-materials').classList.toggle('selected',!rect);
 $('partstools').classList.add('active');
}
function applySheet(){
 const m=materials.find(x=>x.id===selected);if(!m)return;
 if(!window.DeepNest?.parts){notice(t('notReady'));return;}
 if(window.DeepNest.parts.some(p=>p.sheet)){notice(t('exists'));return;}
 const add=$('addrectangle'),confirmButton=$('confirmrectangle'),width=$('rectanglewidth'),height=$('rectangleheight'),price=$('cm-rectangle-price');
 if(!add||!confirmButton||!width||!height)return;
 const before=window.DeepNest.parts.length;
 add.click();
 const units=settings.getSync('units');
 width.value=units==='mm'?m.width:m.width/25.4;
 height.value=units==='mm'?m.height:m.height/25.4;
 if(price)price.value=String(m.cost);
 confirmButton.click();
 if(window.DeepNest.parts.length!==before+1){notice(t('failed'));return;}
 const part=window.DeepNest.parts[before];
 part.cmMaterialId=m.id;
 part.cmSheetCost=m.cost;
 // The Ractive checkbox updates the actual Sheet flag through its own event binding.
 const rows=document.querySelectorAll('#partscroll tbody tr');
 const checkbox=rows[before]?.querySelector('input[type="checkbox"]');
 if(checkbox&&!checkbox.checked)checkbox.click();
 if(!part.sheet){notice(t('mark'));return;}
 notice(t('created'));
 setTab('materials');updateCost();
}
function updateCost(){
 const el=$('cm-mat-result');if(!el)return;
 const nests=window.nest?.get?.('nests')||[];
 const current=nests.find(n=>n.selected);
 if(!current?.placements?.length){el.textContent='';el.hidden=true;return;}
 el.hidden=false;
 const costs=[];
 for(const placement of current.placements){
   const part=window.DeepNest?.parts?.[placement.sheet];
   const cost=part?.cmSheetCost;
   if(!part||!part.sheet||typeof cost!=='number'||!Number.isFinite(cost)||cost<0){
     el.textContent=t('partial');
     return;
   }
   costs.push(cost);
 }
 el.textContent=`${costs.length} ${t('used')} · ${t('total')}: ${money(costs.reduce((a,b)=>a+b,0))}. ${t('noStock')}`;
}
document.addEventListener('DOMContentLoaded',()=>{
 const tools=$('partstools');if(!tools)return;
 const tabs=document.createElement('div');tabs.id='cm-panel-tabs';tabs.setAttribute('data-no-translate','');tabs.innerHTML='<button type="button" id="cm-tab-rect"></button><button type="button" id="cm-tab-materials"></button>';
 const panel=document.createElement('section');panel.id='cm-materials-panel';panel.setAttribute('data-no-translate','');panel.innerHTML=`
  <div class="cm-mat-controls"><select id="cm-mat-select" aria-label="Material"></select></div>
  <div id="cm-mat-detail"></div>
  <div class="cm-mat-controls"><button type="button" id="cm-mat-apply"></button><button type="button" id="cm-mat-add"></button><button type="button" id="cm-mat-edit"></button><button type="button" id="cm-mat-delete"></button></div>
  <div id="cm-mat-editor" hidden>
   <form id="cm-mat-form">
    <label id="cm-mat-label-name" for="cm-mat-name"></label><input id="cm-mat-name" required maxlength="120" />
    <label id="cm-mat-label-width" for="cm-mat-width"></label><input id="cm-mat-width" type="number" min="0.001" step="any" required />
    <label id="cm-mat-label-height" for="cm-mat-height"></label><input id="cm-mat-height" type="number" min="0.001" step="any" required />
    <label id="cm-mat-label-thickness" for="cm-mat-thickness"></label><input id="cm-mat-thickness" type="number" min="0.001" step="any" />
    <label id="cm-mat-label-cost" for="cm-mat-cost"></label><input id="cm-mat-cost" type="number" min="0" step="0.01" required />
    <div id="cm-mat-error" role="alert"></div>
    <div class="cm-mat-controls"><button id="cm-mat-save" type="submit"></button><button id="cm-mat-cancel" type="button"></button></div>
   </form>
   <div id="cm-mat-delete-confirm" hidden><p id="cm-mat-delete-title"></p><div class="cm-mat-controls"><button type="button" id="cm-mat-delete-yes"></button><button type="button" id="cm-mat-delete-no"></button></div></div>
  </div>
  <div id="cm-mat-status" class="cm-mat-note" hidden></div>
  <div id="cm-mat-local" class="cm-mat-note" hidden></div>
  <div id="cm-mat-result" class="cm-mat-result" aria-live="polite" hidden></div>`;
 const dialog=$('rectangledialog');tools.insertBefore(tabs,dialog);tools.insertBefore(panel,dialog.nextSibling);
 $('cm-tab-rect').addEventListener('click',()=>setTab('rect'));
 $('cm-tab-materials').addEventListener('click',()=>setTab('materials'));
 $('cm-mat-select').addEventListener('change',e=>{selected=e.target.value;persist();render();});
 $('cm-mat-add').addEventListener('click',()=>editMaterial(null));
 $('cm-mat-edit').addEventListener('click',()=>editMaterial(materials.find(x=>x.id===selected)));
 $('cm-mat-delete').addEventListener('click',confirmDelete);
 $('cm-mat-delete-yes').addEventListener('click',deleteMaterial);
 $('cm-mat-delete-no').addEventListener('click',closeEditor);
 $('cm-mat-form').addEventListener('submit',e=>{e.preventDefault();saveMaterial();});
 $('cm-mat-cancel').addEventListener('click',closeEditor);
 const languageSelector=$('cm-interface-language');if(languageSelector)languageSelector.addEventListener('change',()=>setTimeout(translateUI,0));
 $('cm-mat-apply').addEventListener('click',applySheet);
 document.addEventListener('cm:panel-tab',e=>setTab(e.detail==='rect'?'rect':'materials'));
 document.addEventListener('cm:rectangle-created',updateCost);
 const target=$('nestcontent');if(target){let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;updateCost();},100);}).observe(target,{subtree:true,childList:true,characterData:true});}
 setTab('rect');tools.classList.remove('active');translateUI();
});
})();
