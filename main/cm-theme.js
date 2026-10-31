/* C&M Designs v1.0.1 — persistent appearance, independent of nesting settings. */
(function(){
'use strict';
const settings=require('electron-settings');
const KEY='cmAppearanceV101';
const options=['dark','light','system'];
let saved='dark';
try{const v=settings.getSync(KEY);if(options.includes(v))saved=v;}catch(e){console.warn('[C&M theme]',e);}
const media=window.matchMedia('(prefers-color-scheme: dark)');
function apply(){document.documentElement.setAttribute('data-cm-theme',saved==='system'?(media.matches?'dark':'light'):saved);}
function translate(){
 let lang='es';try{lang=settings.getSync('interfaceLanguage')==='en'?'en':'es';}catch(e){}
 document.querySelectorAll('[data-cm-theme-es]').forEach(el=>{el.textContent=el.getAttribute('data-cm-theme-'+lang);});
 const labels=lang==='es'?['Oscuro','Claro','Sistema']:['Dark','Light','System'];
 const select=document.getElementById('cm-interface-theme');
 if(select)Array.from(select.options).forEach((o,i)=>{o.textContent=labels[i];});
}
apply();
if(media.addEventListener)media.addEventListener('change',()=>{if(saved==='system')apply();});
else if(media.addListener)media.addListener(()=>{if(saved==='system')apply();});
document.addEventListener('DOMContentLoaded',()=>{
 const select=document.getElementById('cm-interface-theme');
 if(select){select.value=saved;select.addEventListener('change',()=>{if(!options.includes(select.value))return;saved=select.value;try{settings.setSync(KEY,saved);}catch(e){console.warn('[C&M theme save]',e);}apply();});}
 const language=document.getElementById('cm-interface-language');
 if(language)language.addEventListener('change',()=>setTimeout(translate,0));
 translate();
});
})();
