const electron = require('electron')
const remoteMain = require('@electron/remote/main');
remoteMain.initialize();
const { Menu, ipcMain } = electron
const fs = require('graceful-fs');

// Module to control application life.
const app = electron.app

app.commandLine.appendSwitch('--enable-precise-memory-info');

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')

// Experimental NFP mode: a valid environment value overrides the saved UI
// preference for diagnostics. The active value changes only on a new/resumed job.
const cmRectNfpEnvironmentMode = (function(){
	var mode = String(process.env.CM_RECT_NFP_MODE || '').trim().toLowerCase();
	return ['off', 'compare', 'fast'].includes(mode) ? mode : null;
})();
var cmRectNfpJobMode = cmRectNfpEnvironmentMode || 'off';
var cmRectNfpJobId = null;
// Profiling is latched at startup. The environment remains an explicit
// developer override; the persisted UI preference is read before windows start.
var cmNestProfileEnabled = process.env.CM_NEST_PROFILE === '1';
const cmNestProfileMaxSamples = 300;
var cmNestProfileJobs = Object.create(null);
var cmNestProfileActiveJobId = null;
var cmNestProfileSampler = null;
var cmNestProfileSamplePending = false;

function cmProfileNow(){ return Number(process.hrtime.bigint()) / 1e6; }
function cmProfileGetJob(jobId){
	return jobId === null || typeof jobId === 'undefined' ? null : cmNestProfileJobs[String(jobId)];
}
function cmProfileCloseSegment(record){
	if(!record || !record.segmentStart) return;
	record.activeMs += Math.max(0, cmProfileNow() - record.segmentStart);
	record.segmentStart = 0;
	record.active = false;
}
function cmProfileSampleResources(){
	if(!cmNestProfileEnabled || cmNestProfileActiveJobId === null || cmNestProfileSamplePending) return;
	var record = cmProfileGetJob(cmNestProfileActiveJobId);
	if(!record || record.finished || record.samples.length >= cmNestProfileMaxSamples) return;
	cmNestProfileSamplePending = true;
	var sampledAt = cmProfileNow();
	var metrics = [];
	try{ metrics = app.getAppMetrics(); }catch(e){}
	var pids = {
		main:process.pid,
		visibleRenderer:mainWindow && mainWindow.webContents ? mainWindow.webContents.getOSProcessId() : null,
		backgroundRenderer:backgroundWindows[0] && backgroundWindows[0].webContents ? backgroundWindows[0].webContents.getOSProcessId() : null
	};
	function processMetric(role){
		var metric = metrics.find(function(item){ return item.pid === pids[role]; });
		if(!metric) return { pid:pids[role], available:false };
		return {
			pid:metric.pid,
			type:metric.type || null,
			cpuPercent:metric.cpu && Number.isFinite(metric.cpu.percentCPUUsage) ? metric.cpu.percentCPUUsage : null,
			workingSetKB:metric.memory && Number.isFinite(metric.memory.workingSetSize) ? metric.memory.workingSetSize : null,
			peakWorkingSetKB:metric.memory && Number.isFinite(metric.memory.peakWorkingSetSize) ? metric.memory.peakWorkingSetSize : null,
			privateBytesKB:Number.isFinite(metric.memory && metric.memory.privateBytes) ? metric.memory.privateBytes : null,
			sharedKB:null
		};
	}
	var sample = {
		elapsedTotalMs:Math.max(0, sampledAt-record.startedAt),
		state:record.active ? 'active' : 'paused',
		mainJsHeap:{heapUsed:process.memoryUsage().heapUsed,heapTotal:process.memoryUsage().heapTotal,external:process.memoryUsage().external},
		processes:{
			main:processMetric('main'),
			visibleRenderer:processMetric('visibleRenderer'),
			backgroundRenderer:processMetric('backgroundRenderer')
		},
		jsHeap:{
			visibleRenderer:record.latestHeap.visibleRenderer ? Object.assign({},record.latestHeap.visibleRenderer) : null,
			backgroundRenderer:record.latestHeap.backgroundRenderer ? Object.assign({},record.latestHeap.backgroundRenderer) : null
		}
	};
	var rendererReads = [];
	['visibleRenderer','backgroundRenderer'].forEach(function(role){
		var win = role === 'visibleRenderer' ? mainWindow : backgroundWindows[0];
		if(win && win.webContents && typeof win.webContents.getProcessMemoryInfo === 'function'){
			rendererReads.push(win.webContents.getProcessMemoryInfo().then(function(info){
				sample.processes[role].rendererMemoryKB = {
					private:info.private,
					residentSet:info.residentSet,
					shared:info.shared
				};
			}).catch(function(){ sample.processes[role].rendererMemoryKB = null; }));
		}
	});
	Promise.all(rendererReads).then(function(){
		if(!record.finished && record.samples.length < cmNestProfileMaxSamples) record.samples.push(sample);
		else if(record.samples.length >= cmNestProfileMaxSamples) record.sampleLimitReached=true;
	}).finally(function(){ cmNestProfileSamplePending = false; });
}
function cmProfileStartSampling(){
	if(!cmNestProfileEnabled || cmNestProfileSampler) return;
	cmNestProfileSampler = setInterval(function(){
		try{cmProfileSampleResources();}
		catch(profileError){cmNestProfileSamplePending=false;}
	}, 2000);
}
/*
// main menu for mac
const template = [
{
    label: 'Deepnest',
    submenu: [
      {
        role: 'about'
      },
      {
        type: 'separator'
      },
      {
        role: 'services',
        submenu: []
      },
      {
        type: 'separator'
      },
      {
        role: 'hide'
      },
      {
        role: 'hideothers'
      },
      {
        role: 'unhide'
      },
      {
        type: 'separator'
      },
      {
        role: 'quit'
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
*/

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;
var backgroundWindows = [];

// single instance
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createMainWindow() {
	
  // Create the browser window.
  const {width, height} = electron.screen.getPrimaryDisplay().workAreaSize;
  
  var frameless = process.platform == 'darwin';
  //var frameless = true;
  
  mainWindow = new BrowserWindow({width: Math.ceil(width*0.9), height: Math.ceil(height*0.9), frame: !frameless, show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, './main/index.html'),
    protocol: 'file:',
    slashes: true
  }));
  
  remoteMain.enable(mainWindow.webContents);
  mainWindow.setMenu(null);

  // Open the DevTools.
  if (!app.isPackaged) mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  }) 
}

let winCount = 0;

function createBackgroundWindows() {
	//busyWindows = [];
	// used to have 8, now just 1 background window
	if(winCount < 1){
		var back = new BrowserWindow({
			show: false,
                        webPreferences: {
                          nodeIntegration: true,
                          contextIsolation: false,
                          sandbox: false
                        }
		});
		
		//back.webContents.openDevTools();
		
		
                // Diagnóstico temporal del motor de nesting
                back.webContents.on('did-finish-load', () => {
                    console.log('[BACKGROUND] Cargada:', back.webContents.getURL());
                    if (!app.isPackaged) back.webContents.openDevTools({ mode: 'detach' });
                });

                back.webContents.on('did-fail-load', (event, code, description) => {
                    console.error('[BACKGROUND] Error de carga:', code, description);
                });

                back.webContents.on('console-message', (event, level, message) => {
                    console.log('[BACKGROUND CONSOLE]', level, message);
                });

                back.webContents.on('render-process-gone', (event, details) => {
                    console.error('[BACKGROUND] Renderer terminado:', details);
                });

back.loadURL(url.format({
			pathname: path.join(__dirname, './main/background.html'),
			protocol: 'file:',
			slashes: true
		}));
		
		remoteMain.enable(back.webContents);
                backgroundWindows[winCount] = back;
		
		back.once('ready-to-show', () => {
		  //back.show();
		  winCount++;
		  createBackgroundWindows();
		});
	}
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
	if(!cmNestProfileEnabled){
		try{ cmNestProfileEnabled = require('electron-settings').getSync('debugMode') === true; }
		catch(profileSettingError){ console.warn('[C&M profile] No se pudo leer debugMode; perfilado desactivado.', profileSettingError); }
	}
	createMainWindow();
	mainWindow.once('ready-to-show', () => {
	  mainWindow.show();
	  createBackgroundWindows();
	})
	mainWindow.on('closed', () => {
	  app.quit();
	});
})

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  app.quit()
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow()
  }
})

app.on('before-quit', function(){
	var p = path.join(__dirname, './nfpcache')
	  if( fs.existsSync(p) ) {
		fs.readdirSync(p).forEach(function(file,index){
		  var curPath = p + "/" + file;
		  fs.unlinkSync(curPath);
		});
	}
});

//ipcMain.on('background-response', (event, payload) => mainWindow.webContents.send('background-response', payload));
//ipcMain.on('background-start', (event, payload) => backgroundWindows[0].webContents.send('background-start', payload));

ipcMain.on('background-start', function(event, payload){
	console.log('starting background!');
	for(var i=0; i<backgroundWindows.length; i++){
		if(backgroundWindows[i] && !backgroundWindows[i].isBusy){
			backgroundWindows[i].isBusy = true;
			var jobPayload = Object.assign({}, payload, {
				rectNfpMode: cmRectNfpJobMode,
				rectNfpJobId: cmRectNfpJobId,
				cmProfileEnabled: cmNestProfileEnabled
			});
			backgroundWindows[i].webContents.send('background-start', jobPayload);
			break;
		}
	}
});

ipcMain.on('cm-rect-nfp-job-start', function(event, payload){
	var requested = payload && payload.mode;
	if(requested !== 'off' && requested !== 'fast') requested = 'off';
	cmRectNfpJobId = payload && Number.isSafeInteger(payload.jobId) ? payload.jobId : null;
	cmRectNfpJobMode = cmRectNfpEnvironmentMode || requested;
	if(!cmNestProfileEnabled || cmRectNfpJobId === null) return;
	var key = String(cmRectNfpJobId), record = cmNestProfileJobs[key];
	if(!record || record.finished){
		Object.keys(cmNestProfileJobs).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(oldKey){
			if(Object.keys(cmNestProfileJobs).length >= 8 && cmNestProfileJobs[oldKey].finished) delete cmNestProfileJobs[oldKey];
		});
		record = cmNestProfileJobs[key] = {
			jobId:cmRectNfpJobId,
			mode:cmRectNfpJobMode,
			startedAt:cmProfileNow(),
			startedAtEpoch:Date.now(),
			activeMs:0,
			segmentStart:0,
			active:false,
			samples:[],
			jsHeapSamples:[],
			latestHeap:{},
			counts:{backgroundEvaluations:0},
			scopes:{},
			timings:{pairPrepareMs:0,pairParallelWallMs:0,pairWorkerMs:0,backgroundWallMs:0},
			finished:false,
			sampleLimitReached:false
		};
		record.segmentStart=cmProfileNow();
		record.active=true;
	}else if(!record.active){
		record.segmentStart=cmProfileNow();
		record.active=true;
	}
	cmNestProfileActiveJobId=cmRectNfpJobId;
	cmProfileStartSampling();
});

ipcMain.on('background-response', function(event, payload){
	for(var i=0; i<backgroundWindows.length; i++){
		if(backgroundWindows[i].webContents == event.sender){
			mainWindow.webContents.send('background-response', payload);
			backgroundWindows[i].isBusy = false;
			break;
		}
	}
});

ipcMain.on('background-progress', function(event, payload){
	mainWindow.webContents.send('background-progress', payload);
});

ipcMain.on('background-profile-evaluation', function(event, payload){
	var fromBackground = backgroundWindows.some(function(back){ return back && back.webContents === event.sender; });
	var record = payload && cmProfileGetJob(payload.jobId);
	if(!cmNestProfileEnabled || !fromBackground || !record || record.finished || !payload.metrics) return;
	var metrics = payload.metrics;
	record.counts.backgroundEvaluations++;
	Object.keys(metrics.counts || {}).forEach(function(key){
		var value=metrics.counts[key];
		if(typeof value !== 'number' || !Number.isFinite(value)) return;
		if(key === 'piecesPlacedInEvaluation'){
			record.counts.piecesPlacedAcrossEvaluations=(record.counts.piecesPlacedAcrossEvaluations || 0)+value;
			record.counts.lastEvaluationPiecesPlaced=value;
		}else if(key === 'sheetsUsedInEvaluation'){
			record.counts.sheetsUsedAcrossEvaluations=(record.counts.sheetsUsedAcrossEvaluations || 0)+value;
			record.counts.lastEvaluationSheetsUsed=value;
		}else record.counts[key]=(record.counts[key] || 0)+value;
	});
	Object.keys(metrics.timings || {}).forEach(function(key){
		if(Number.isFinite(metrics.timings[key])) record.timings[key]=(record.timings[key] || 0)+metrics.timings[key];
	});
	Object.keys(metrics.scopes || {}).forEach(function(name){
		var source=metrics.scopes[name], target=record.scopes[name];
		if(!target) target=record.scopes[name]={calls:0,inclusiveMs:0,exclusiveMs:0,minInclusiveMs:null,maxInclusiveMs:0};
		target.calls+=source.calls || 0;
		target.inclusiveMs+=source.inclusiveMs || 0;
		target.exclusiveMs+=source.exclusiveMs || 0;
		if(Number.isFinite(source.minInclusiveMs)) target.minInclusiveMs=target.minInclusiveMs===null?source.minInclusiveMs:Math.min(target.minInclusiveMs,source.minInclusiveMs);
		if(Number.isFinite(source.maxInclusiveMs)) target.maxInclusiveMs=Math.max(target.maxInclusiveMs,source.maxInclusiveMs);
	});
});

ipcMain.on('cm-nest-profile-heap', function(event, payload){
	var role = event.sender === (mainWindow && mainWindow.webContents) ? 'visibleRenderer' : null;
	if(!role) role=backgroundWindows.some(function(back){ return back && back.webContents === event.sender; }) ? 'backgroundRenderer' : null;
	var record = payload && cmProfileGetJob(payload.jobId);
	if(!cmNestProfileEnabled || !role || !record || record.finished || !payload.heap) return;
	var heap={role:role,elapsedTotalMs:Math.max(0,cmProfileNow()-record.startedAt),heapUsed:payload.heap.heapUsed,heapTotal:payload.heap.heapTotal,external:payload.heap.external,arrayBuffers:payload.heap.arrayBuffers,v8:payload.v8 || null};
	record.latestHeap[role]=heap;
	if(record.jsHeapSamples.length < cmNestProfileMaxSamples) record.jsHeapSamples.push(heap);
});

ipcMain.on('cm-nest-profile-finish', function(event, payload){
	if(!cmNestProfileEnabled || event.sender !== (mainWindow && mainWindow.webContents) || !payload) return;
	var record=cmProfileGetJob(payload.jobId);
	if(!record || record.finished) return;
	cmProfileCloseSegment(record);
	record.finished=true;
	record.finishedAtEpoch=Date.now();
	record.totalMs=Math.max(0,cmProfileNow()-record.startedAt);
	record.finish=payload.finish || {};
	record.configuration={optimizationMinutes:record.finish.configuredMinutes,rotations:record.finish.rotations,spacing:record.finish.spacing,spacingUnit:record.finish.spacingUnit || 'svg-units',spacingMm:record.finish.spacingMm,populationSize:record.finish.populationSize};
	var geneticSummary=record.finish.nest || {};
	var evaluationsSent=Number(geneticSummary.evaluationsSent) || 0;
	var evaluationsCompleted=Number(geneticSummary.evaluationsCompleted) || 0;
	record.result={piecesTarget:record.finish.piecesTarget,piecesPlaced:record.finish.piecesPlaced,sheetsUsed:record.finish.sheetsUsed,evaluationsSent:evaluationsSent,evaluationsCompleted:evaluationsCompleted,evaluationsPendingAtStop:Math.max(0,evaluationsSent-evaluationsCompleted)};
	record.resourceSampling={intervalMs:2000,maxSamples:cmNestProfileMaxSamples,samples:record.samples,jsHeapSamples:record.jsHeapSamples,truncated:record.samples.length>=cmNestProfileMaxSamples || record.jsHeapSamples.length>=cmNestProfileMaxSamples,rssSummed:false};
	record.limitations=[
		'Los tiempos de funciones son transcurridos; los tiempos inclusivos se anidan y no deben sumarse entre sí.',
		'El tiempo de workers es una suma paralela y puede superar el tiempo transcurrido del mapa.',
		'El RSS incluye memoria compartida; no se suma como memoria física exclusiva.',
		'CPU es el porcentaje muestreado por Electron, no tiempo de CPU acumulado por función; las medidas de funciones son tiempo transcurrido.',
		'El tiempo de calculateNFP mide la llamada completa en el límite JS/C++, no separa conversión, núcleo Boost.Polygon y materialización del resultado.',
	'Los timers de Clipper en el renderer principal no desglosan llamadas internas de los workers; estos reportan por separado el tiempo total del worker y MinkowskiSum.',
		'El heap del renderer se muestrea desde sus timers y no garantiza capturar picos mientras el hilo está bloqueado.',
		'La memoria privada, RSS y compartida de renderers proviene de Electron en main.js; el heap JS del renderer de fondo no está disponible en esta API y se reporta null.',
		'No se fija ni reproduce una semilla aleatoria; las ejecuciones GA pueden explorar evaluaciones distintas.',
		'piecesPlacedAcrossEvaluations y sheetsUsedAcrossEvaluations suman todas las evaluaciones; el resultado final usa result.piecesPlaced y result.sheetsUsed.',
		'Una diferencia entre evaluaciones enviadas y completadas indica trabajo aún pendiente o interrumpido al detenerse el anidado.'
	];
	if(cmNestProfileSampler){ clearInterval(cmNestProfileSampler); cmNestProfileSampler=null; }
	cmNestProfileActiveJobId=null;
	var report=JSON.parse(JSON.stringify(record));
	delete report.segmentStart; delete report.active; delete report.latestHeap; delete report.finished;
	if(mainWindow && mainWindow.webContents) mainWindow.webContents.send('cm-nest-profile-summary', report);
});

ipcMain.on('background-nfp-mode-active', function(event, payload){
	var fromBackground = backgroundWindows.some(function(back){ return back && back.webContents === event.sender; });
	if(fromBackground && mainWindow && payload && payload.jobId === cmRectNfpJobId){
		mainWindow.webContents.send('cm-rect-nfp-mode-active', {
			jobId: payload.jobId,
			mode: payload.mode === cmRectNfpJobMode ? payload.mode : 'off'
		});
	}
});

ipcMain.on('background-stop', function(event){
	if(cmNestProfileEnabled){
		var activeProfile=cmProfileGetJob(cmNestProfileActiveJobId);
		if(activeProfile) cmProfileCloseSegment(activeProfile);
	}
	for(var i=0; i<backgroundWindows.length; i++){
		if(backgroundWindows[i]){
			backgroundWindows[i].destroy();
			backgroundWindows[i] = null;
		}
	}
	winCount = 0;
	
	createBackgroundWindows();
	
	console.log('stopped!', backgroundWindows);
});

ipcMain.on('login-success', function(event, payload){
	mainWindow.webContents.send('login-success', payload);
});

ipcMain.on('purchase-success', function(event){
	mainWindow.webContents.send('purchase-success');
});
