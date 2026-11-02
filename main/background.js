'use strict';

var cmTotalTimerSequence = 0;
function cmNextTotalTimerLabel(){
	return 'Total ' + (++cmTotalTimerSequence);
}

var cmNestProfile = null;
function cmProfileAddCount(name, amount){
	try{if(cmNestProfile) cmNestProfile.counts[name]=(cmNestProfile.counts[name]||0)+amount;}catch(e){}
}
function cmProfileSetCount(name, value){
	try{if(cmNestProfile) cmNestProfile.counts[name]=value;}catch(e){}
}


function clone(nfp){
	var newnfp = [];
	for(var i=0; i<nfp.length; i++){
		newnfp.push({
			x: nfp[i].x,
			y: nfp[i].y
		});
	}
	
	if(nfp.children && nfp.children.length > 0){
		newnfp.children = [];
		for(i=0; i<nfp.children.length; i++){
			var child = nfp.children[i];
			var newchild = [];
			for(var j=0; j<child.length; j++){
				newchild.push({
					x: child[j].x,
					y: child[j].y
				});
			}
			newnfp.children.push(newchild);
		}
	}
	
	return newnfp;
}

function cloneNfp(nfp, inner){
	if(!inner){
		return clone(nfp);
	}
	
	// inner nfp is actually an array of nfps
	var newnfp = [];
	for(var i=0; i<nfp.length; i++){
		newnfp.push(clone(nfp[i]));
	}
	
	return newnfp;
}

window.db = {
	has: function(obj){
		var key = 'A'+obj.A+'B'+obj.B+'Arot'+parseInt(obj.Arotation)+'Brot'+parseInt(obj.Brotation);
		if(window.nfpcache[key]){
			return true;
		}
		return false;
	},
	
	find : function(obj, inner){
		var key = 'A'+obj.A+'B'+obj.B+'Arot'+parseInt(obj.Arotation)+'Brot'+parseInt(obj.Brotation);
		//console.log('key: ', key);
		if(window.nfpcache[key]){
			return cloneNfp(window.nfpcache[key], inner);
		}
		/*var keypath = './nfpcache/'+key+'.json';
		if(fs.existsSync(keypath)){
			// could be partially written
			obj = null;
			try{
				obj = JSON.parse(fs.readFileSync(keypath).toString());
			}
			catch(e){
				return null;
			}
			var nfp = obj.nfp;
			nfp.children = obj.children;
			
			window.nfpcache[key] = clone(nfp);
			
			return nfp;
		}*/
		return null;
	},
	
	insert : function(obj, inner){
		var key = 'A'+obj.A+'B'+obj.B+'Arot'+parseInt(obj.Arotation)+'Brot'+parseInt(obj.Brotation);
		if(window.performance.memory.totalJSHeapSize < 0.8*window.performance.memory.jsHeapSizeLimit){
			window.nfpcache[key] = cloneNfp(obj.nfp, inner);
			//console.log('cached: ',window.cache[key].poly);
			//console.log('using', window.performance.memory.totalJSHeapSize/window.performance.memory.jsHeapSizeLimit);
		}
		
		/*obj.children = obj.nfp.children;
		
		var keypath = './nfpcache/'+key+'.json';
		fq.writeFile(keypath, JSON.stringify(obj), function (err) {
			if (err){
				console.log("couldn't write");
			}
		});*/
	}
}

window.onload = function () {
	const { ipcRenderer } = require('electron');
	window.ipcRenderer = ipcRenderer;
	const fs = require('fs');
        const path = require('path');

        const packagedAddon = path.join(
            process.resourcesPath, 'native', 'addon.node'
        );

        const developmentAddon = path.join(
            __dirname, '..', 'build', 'Release', 'addon.node'
        );

        window.addon = require(
            fs.existsSync(packagedAddon) ? packagedAddon : developmentAddon
        );
	
	window.path = require('path')
	window.url = require('url')
	window.fs = require('graceful-fs');
	window.FileQueue = require('filequeue');
	window.fq = new FileQueue(500);
	
	window.nfpcache = {};
	var cmProfileHooksInstalled = false;
	function cmProfileNow(){
		try{if(process.hrtime && typeof process.hrtime.bigint === 'function') return Number(process.hrtime.bigint())/1e6;}catch(e){}
		try{if(performance && typeof performance.now === 'function') return performance.now();}catch(e){}
		return 0;
	}
	function cmProfileMeasure(name, fn){
		if(!cmNestProfile) return fn();
		var start, parent, frame;
		try{
			start=cmProfileNow();
			parent=cmNestProfile.stack[cmNestProfile.stack.length-1];
			frame={name:name,child:0}; cmNestProfile.stack.push(frame);
		}catch(profileError){return fn();}
		try{return fn();}finally{
			try{
				var elapsed=Math.max(0,cmProfileNow()-start); cmNestProfile.stack.pop();
				var stat=cmNestProfile.scopes[name] || (cmNestProfile.scopes[name]={calls:0,inclusiveMs:0,exclusiveMs:0,minInclusiveMs:null,maxInclusiveMs:0});
				stat.calls++; stat.inclusiveMs+=elapsed; stat.exclusiveMs+=Math.max(0,elapsed-frame.child);
				stat.minInclusiveMs=stat.minInclusiveMs===null?elapsed:Math.min(stat.minInclusiveMs,elapsed); stat.maxInclusiveMs=Math.max(stat.maxInclusiveMs,elapsed);
				if(parent) parent.child+=elapsed;
			}catch(profileError){ /* La telemetría no debe enmascarar el resultado geométrico ni su error. */ }
		}
	}
	function cmProfileWrap(name, owner, method){
		if(!owner || typeof owner[method] !== 'function' || owner[method]._cmProfileWrapped) return;
		var original=owner[method];
		var wrapped=function(){var self=this,args=arguments;return cmProfileMeasure(name,function(){return original.apply(self,args);});};
		wrapped._cmProfileWrapped=true; owner[method]=wrapped;
	}
	function cmProfileInstallHooks(){
		if(!cmNestProfile || cmProfileHooksInstalled) return;
		cmProfileHooksInstalled=true;
		var originalInner=getInnerNfp, originalOuter=getOuterNfp;
		getInnerNfp=function(){var args=arguments; return cmProfileMeasure('nfpInner',function(){return originalInner.apply(null,args);});};
		getOuterNfp=function(){var args=arguments; return cmProfileMeasure('nfpOuter',function(){return originalOuter.apply(null,args);});};
		cmProfileWrap('addonCalculateNFP', addon, 'calculateNFP');
		if(typeof ClipperLib !== 'undefined' && ClipperLib.Clipper){
			cmProfileWrap('clipperExecute',ClipperLib.Clipper.prototype,'Execute');
			cmProfileWrap('clipperMinkowskiSum',ClipperLib.Clipper,'MinkowskiSum');
		}
	}
	  
	ipcRenderer.on('background-start', (event, data) => {
		var profileEnabled=!!(data && data.cmProfileEnabled && Number.isSafeInteger(data.rectNfpJobId));
		cmNestProfile=profileEnabled ? {jobId:data.rectNfpJobId,mode:data.rectNfpMode||'off',stack:[],scopes:{},counts:{},timings:{},startedAt:cmProfileNow()} : null;
		var rectCompareBefore=cmRectInnerNfpDiagnostics.compared, rectDifferentBefore=cmRectInnerNfpDiagnostics.different;
		if(profileEnabled){
			try{cmProfileInstallHooks();}catch(profileError){console.warn('[C&M profile] No se pudieron instalar timers:',profileError);}
		}
		var jobMode = data && data.rectNfpMode;
		if(jobMode !== 'off' && jobMode !== 'compare' && jobMode !== 'fast') jobMode = cmRectInnerNfpMode;
		cmRectInnerNfpMode = jobMode;
		cmRectInnerNfpDiagnostics.mode = cmRectInnerNfpMode;
		if(data && Number.isSafeInteger(data.rectNfpJobId)){
			ipcRenderer.send('background-nfp-mode-active', { jobId:data.rectNfpJobId, mode:cmRectInnerNfpMode });
		}
		var index = data.index;
	    var individual = data.individual;

	    var parts = individual.placement;
		var rotations = individual.rotation;
		var ids = data.ids;
		var sources = data.sources;
		var children = data.children;
		
		for(var i=0; i<parts.length; i++){
			parts[i].rotation = rotations[i];
			parts[i].id = ids[i];
			parts[i].source = sources[i];
			if(!data.config.simplify){
				parts[i].children = children[i];
			}
		}
		
		for(i=0; i<data.sheets.length; i++){
			data.sheets[i].id = data.sheetids[i];
			data.sheets[i].source = data.sheetsources[i];
			data.sheets[i].children = data.sheetchildren[i];
		}
		
		// preprocess
		var pairPrepareStarted=profileEnabled?cmProfileNow():0;
		var pairs = [];
		var seenPairs = new Set();
		for(var i=0; i<parts.length; i++){
			var B = parts[i];
			for(var j=0; j<i; j++){
				var A = parts[j];
				var key = {
					A: A,
					B: B,
					Arotation: A.rotation,
					Brotation: B.rotation,
					Asource: A.source,
					Bsource: B.source
				};
				var doc = {
					A: A.source,
					B: B.source,
					Arotation: A.rotation,
					Brotation: B.rotation
				}
				var pairKey;
				var duplicate = false;
				if(pairs.length > 0){
					pairKey = JSON.stringify([key.Asource, key.Bsource, key.Arotation, key.Brotation]);
					duplicate = seenPairs.has(pairKey);
				}
				var pairCacheHas = duplicate ? false : db.has(doc);
				if(profileEnabled && !duplicate){cmProfileAddCount('pairDbHasCalls',1);if(pairCacheHas)cmProfileAddCount('pairDbHasHits',1);}
				if(!duplicate && !pairCacheHas){
					if(pairKey === undefined){
						pairKey = JSON.stringify([key.Asource, key.Bsource, key.Arotation, key.Brotation]);
					}
					seenPairs.add(pairKey);
					pairs.push(key);
				}
			}
		}
		if(profileEnabled){cmProfileSetCount('pairsPrepared',pairs.length);try{cmNestProfile.timings.pairPrepareMs=cmProfileNow()-pairPrepareStarted;}catch(profileError){}}
		
		console.log('pairs: ',pairs.length);
		  
		  var process = function(pair){
			var workerStarted=null;
			try{if(pair._cmProfileEnabled)workerStarted=performance.now();}catch(e){}
			
			var A = rotatePolygon(pair.A, pair.Arotation);
			var B = rotatePolygon(pair.B, pair.Brotation);
			
			var clipper = new ClipperLib.Clipper();
			
			var Ac = toClipperCoordinates(A);
			ClipperLib.JS.ScaleUpPath(Ac, 10000000);
			var Bc = toClipperCoordinates(B);
			ClipperLib.JS.ScaleUpPath(Bc, 10000000);
			for(var i=0; i<Bc.length; i++){
				Bc[i].X *= -1;
				Bc[i].Y *= -1;
			}
			var minkowskiStarted=null;
			try{if(pair._cmProfileEnabled)minkowskiStarted=performance.now();}catch(e){}
			var solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
			try{if(pair._cmProfileEnabled && minkowskiStarted!==null)pair._cmWorkerMinkowskiMs=Math.max(0,performance.now()-minkowskiStarted);}catch(e){}
			var clipperNfp;
		
			var largestArea = null;
			for(i=0; i<solution.length; i++){
				var n = toNestCoordinates(solution[i], 10000000);
				var sarea = -GeometryUtil.polygonArea(n);
				if(largestArea === null || largestArea < sarea){
					clipperNfp = n;
					largestArea = sarea;
				}
			}
			
			for(var i=0; i<clipperNfp.length; i++){
				clipperNfp[i].x += B[0].x;
				clipperNfp[i].y += B[0].y;
			}
			
			pair.A = null;
			pair.B = null;
			pair.nfp = clipperNfp;
			try{if(pair._cmProfileEnabled && workerStarted!==null)pair._cmWorkerMs=Math.max(0,performance.now()-workerStarted);}catch(e){}
			return pair;
			
			function toClipperCoordinates(polygon){
				var clone = [];
				for(var i=0; i<polygon.length; i++){
					clone.push({
						X: polygon[i].x,
						Y: polygon[i].y
					});
				}
	
				return clone;
			};
			
			function toNestCoordinates(polygon, scale){
				var clone = [];
				for(var i=0; i<polygon.length; i++){
					clone.push({
						x: polygon[i].X/scale,
						y: polygon[i].Y/scale
					});
				}
	
				return clone;
			};
			
			function rotatePolygon(polygon, degrees){
				var rotated = [];
				var angle = degrees * Math.PI / 180;
				for(var i=0; i<polygon.length; i++){
					var x = polygon[i].x;
					var y = polygon[i].y;
					var x1 = x*Math.cos(angle)-y*Math.sin(angle);
					var y1 = x*Math.sin(angle)+y*Math.cos(angle);
						
					rotated.push({x:x1, y:y1});
				}
	
				return rotated;
			};
		  }
		  
		  // run the placement synchronously
		  function sync(){
		  	//console.log('starting synchronous calculations', Object.keys(window.nfpCache).length);
		  	console.log('in sync');
		  	var c=0;
		  	for (var key in window.nfpcache) {
				c++;
			}
			console.log('nfp cached:', c);
			var placeStarted=profileEnabled?cmProfileNow():0;
			var placement = profileEnabled ? cmProfileMeasure('placeParts',function(){return placeParts(data.sheets, parts, data.config, index);}) : placeParts(data.sheets, parts, data.config, index);
			if(profileEnabled){try{cmNestProfile.counts.piecesPlacedInEvaluation=(placement.placements||[]).reduce(function(n,s){return n+((s&&s.sheetplacements)||[]).length;},0);cmNestProfile.counts.sheetsUsedInEvaluation=(placement.placements||[]).length;cmNestProfile.timings.placePartsWallMs=cmProfileNow()-placeStarted;}catch(profileError){console.warn('[C&M profile] No se pudieron registrar métricas de colocación:',profileError);}}
	
			placement.index = data.index;
			if(profileEnabled){
				try{
					cmNestProfile.timings.backgroundWallMs=cmProfileNow()-cmNestProfile.startedAt;
					cmNestProfile.counts.rectCompareAttempts=Math.max(cmNestProfile.counts.rectCompareAttempts||0,cmRectInnerNfpDiagnostics.compared-rectCompareBefore);
					cmNestProfile.counts.rectCompareDifferent=cmRectInnerNfpDiagnostics.different-rectDifferentBefore;
					if(cmNestProfile.mode==='fast') cmNestProfile.counts.fastModeEvaluations=1;
					ipcRenderer.send('background-profile-evaluation',{jobId:cmNestProfile.jobId,metrics:{scopes:cmNestProfile.scopes,counts:cmNestProfile.counts,timings:cmNestProfile.timings}});
				}catch(profileError){ console.warn('[C&M profile] No se pudieron enviar métricas de evaluación:',profileError); }
			}
			ipcRenderer.send('background-response', placement);
		  }
		  
	  var totalTimerLabel = cmNextTotalTimerLabel();
	  console.time(totalTimerLabel);
		  
		  
		  if(pairs.length > 0){
			  if(profileEnabled) pairs.forEach(function(pair){pair._cmProfileEnabled=true;});
			  var parallelStart=profileEnabled?cmProfileNow():0;
			  var p = new Parallel(pairs, {
				evalPath: 'util/eval.js',
				maxWorkers: 2, // v7: at most two parallel NFP calculation workers
				synchronous: false
			  });
			  
			  var spawncount = 0;
				
				p._spawnMapWorker = function (i, cb, done, env, wrk){
					// hijack the worker call to check progress
					ipcRenderer.send('background-progress', {index: index, progress: 0.5*(spawncount++/pairs.length)});
					return Parallel.prototype._spawnMapWorker.call(p, i, cb, done, env, wrk);
				}
			  
			  p.require('clipper.js');
			  p.require('geometryutil.js');
		  
			  p.map(process).then(function(processed){
				var pairPostprocessStarted=profileEnabled?cmProfileNow():0;
				if(profileEnabled){
					try{
						cmNestProfile.timings.pairParallelWallMs=cmProfileNow()-parallelStart;
						cmNestProfile.counts.clipWorkerCalls=processed.length;
						cmNestProfile.timings.pairWorkerMs=0;cmNestProfile.timings.workerMinkowskiMs=0;
						processed.forEach(function(pair){cmNestProfile.timings.pairWorkerMs+=pair._cmWorkerMs||0;cmNestProfile.timings.workerMinkowskiMs+=pair._cmWorkerMinkowskiMs||0;delete pair._cmProfileEnabled;delete pair._cmWorkerMs;delete pair._cmWorkerMinkowskiMs;});
					}catch(profileError){console.warn('[C&M profile] No se pudieron agregar tiempos de pares:',profileError);}
				}
			  	 function getPart(source){
					for(var k=0; k<parts.length; k++){
						if(parts[k].source == source){
							return parts[k];
						}
					}
					return null;
				  }
				// store processed data in cache
				for(var i=0; i<processed.length; i++){
					// returned data only contains outer nfp, we have to account for any holes separately in the synchronous portion
					// this is because the c++ addon which can process interior nfps cannot run in the worker thread					
					var A = getPart(processed[i].Asource);
					var B = getPart(processed[i].Bsource);
										
					var Achildren = [];
					
					var j;
					if(A.children){
						for(j=0; j<A.children.length; j++){
							Achildren.push(rotatePolygon(A.children[j], processed[i].Arotation));
						}
					}
					
					if(Achildren.length > 0){
						var Brotated = rotatePolygon(B, processed[i].Brotation);
						var bbounds = GeometryUtil.getPolygonBounds(Brotated);
						var cnfp = [];
						
						for(j=0; j<Achildren.length; j++){
							var cbounds = GeometryUtil.getPolygonBounds(Achildren[j]);
							if(cbounds.width > bbounds.width && cbounds.height > bbounds.height){
								var n = getInnerNfp(Achildren[j], Brotated, data.config);
								if(n && n.length > 0){
									cnfp = cnfp.concat(n);
								}
							}
						}
						
						processed[i].nfp.children = cnfp;
					}
					
					var doc = {
						A: processed[i].Asource,
						B: processed[i].Bsource,
						Arotation: processed[i].Arotation,
						Brotation: processed[i].Brotation,
						nfp: processed[i].nfp
					};
					window.db.insert(doc);
					
				}
				console.timeEnd(totalTimerLabel);
				console.log('before sync');
				if(profileEnabled){try{cmNestProfile.timings.pairPostprocessMs=cmProfileNow()-pairPostprocessStarted;}catch(profileError){}}
				sync();
			  });
		  }
		  else{
			console.timeEnd(totalTimerLabel);
		  	sync();
		  }
	});
};

// returns the square of the length of any merged lines
// filter out any lines less than minlength long
function mergedLength(parts, p, minlength, tolerance){
	var min2 = minlength*minlength;
	var totalLength = 0;
	var segments = [];
	
	for(var i=0; i<p.length; i++){
		var A1 = p[i];
		
		if(i+1 == p.length){
			A2 = p[0];
		}
		else{
			var A2 = p[i+1];
		}
		
		if(!A1.exact || !A2.exact){
			continue;
		}
		
		var Ax2 = (A2.x-A1.x)*(A2.x-A1.x);
		var Ay2 = (A2.y-A1.y)*(A2.y-A1.y);
		
		if(Ax2+Ay2 < min2){
			continue;
		}
		
		var angle = Math.atan2((A2.y-A1.y),(A2.x-A1.x));

		var c = Math.cos(-angle);
		var s = Math.sin(-angle);
		
		var c2 = Math.cos(angle);
		var s2 = Math.sin(angle);
		
		var relA2 = {x: A2.x-A1.x, y: A2.y-A1.y};
		var rotA2x = relA2.x * c - relA2.y * s;
				
		for(var j=0; j<parts.length; j++){
			var B = parts[j];
			if(B.length > 1){
				for(var k=0; k<B.length; k++){
					var B1 = B[k];
					
					if(k+1 == B.length){
						var B2 = B[0];
					}
					else{
						var B2 = B[k+1];
					}
					
					if(!B1.exact || !B2.exact){
						continue;
					}
					var Bx2 = (B2.x-B1.x)*(B2.x-B1.x);
					var By2 = (B2.y-B1.y)*(B2.y-B1.y);
					
					if(Bx2+By2 < min2){
						continue;
					}
					
					// B relative to A1 (our point of rotation)
					var relB1 = {x: B1.x - A1.x, y: B1.y - A1.y};
					var relB2 = {x: B2.x - A1.x, y: B2.y - A1.y};
					
					
					// rotate such that A1 and A2 are horizontal
					var rotB1 = {x: relB1.x * c - relB1.y * s, y: relB1.x * s + relB1.y * c};
					var rotB2 = {x: relB2.x * c - relB2.y * s, y: relB2.x * s + relB2.y * c};
					
					if(!GeometryUtil.almostEqual(rotB1.y, 0, tolerance) || !GeometryUtil.almostEqual(rotB2.y, 0, tolerance)){
						continue;
					}
					
					var min1 = Math.min(0, rotA2x);
					var max1 = Math.max(0, rotA2x);
					
					var min2 = Math.min(rotB1.x, rotB2.x);
					var max2 = Math.max(rotB1.x, rotB2.x);
					
					// not overlapping
					if(min2 >= max1 || max2 <= min1){
						continue;
					}
					
					var len = 0;
					var relC1x = 0;
					var relC2x = 0;
					
					// A is B
					if(GeometryUtil.almostEqual(min1, min2) && GeometryUtil.almostEqual(max1, max2)){
						len = max1-min1;
						relC1x = min1;
						relC2x = max1;
					}
					// A inside B
					else if(min1 > min2 && max1 < max2){
						len = max1-min1;
						relC1x = min1;
						relC2x = max1;
					}
					// B inside A
					else if(min2 > min1 && max2 < max1){
						len = max2-min2;
						relC1x = min2;
						relC2x = max2;
					}
					else{
						len = Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
						relC1x = Math.min(max1, max2);
						relC2x = Math.max(min1, min2);		
					}
					
					if(len*len > min2){
						totalLength += len;
						
						var relC1 = {x: relC1x * c2, y: relC1x * s2};
						var relC2 = {x: relC2x * c2, y: relC2x * s2};
						
						var C1 = {x: relC1.x + A1.x, y: relC1.y + A1.y};
						var C2 = {x: relC2.x + A1.x, y: relC2.y + A1.y};
						
						segments.push([C1, C2]);
					}
				}
			}
			
			if(B.children && B.children.length > 0){
				var child = mergedLength(B.children, p, minlength, tolerance);
				totalLength += child.totalLength;
				segments = segments.concat(child.segments);
			}
		}
	}
	
	return {totalLength: totalLength, segments: segments};
}

function shiftPolygon(p, shift){
	var shifted = [];
	for(var i=0; i<p.length; i++){
		shifted.push({x: p[i].x+shift.x, y:p[i].y+shift.y, exact: p[i].exact});
	}
	if(p.children && p.children.length){
		shifted.children = [];
		for(i=0; i<p.children.length; i++){
			shifted.children.push(shiftPolygon(p.children[i], shift));
		}
	}
	
	return shifted;
}
// jsClipper uses X/Y instead of x/y...
function toClipperCoordinates(polygon){
	var clone = [];
	for(var i=0; i<polygon.length; i++){
		clone.push({
			X: polygon[i].x,
			Y: polygon[i].y
		});
	}
	
	return clone;
};

// returns clipper nfp. Remember that clipper nfp are a list of polygons, not a tree!
function nfpToClipperCoordinates(nfp, config){
	var clipperNfp = [];
	
	// children first
	if(nfp.children && nfp.children.length > 0){
		for(var j=0; j<nfp.children.length; j++){
			if(GeometryUtil.polygonArea(nfp.children[j]) < 0){
				nfp.children[j].reverse();
			}
			var childNfp = toClipperCoordinates(nfp.children[j]);
			ClipperLib.JS.ScaleUpPath(childNfp, config.clipperScale);
			clipperNfp.push(childNfp);
		}
	}
	
	if(GeometryUtil.polygonArea(nfp) > 0){
		nfp.reverse();
	}
	
	var outerNfp = toClipperCoordinates(nfp);
	
	// clipper js defines holes based on orientation

	ClipperLib.JS.ScaleUpPath(outerNfp, config.clipperScale);
	//var cleaned = ClipperLib.Clipper.CleanPolygon(outerNfp, 0.00001*config.clipperScale);
	
	clipperNfp.push(outerNfp);
	//var area = Math.abs(ClipperLib.Clipper.Area(cleaned));
	
	return clipperNfp;
}

// inner nfps can be an array of nfps, outer nfps are always singular
function innerNfpToClipperCoordinates(nfp, config){
	var clipperNfp = [];
	for(var i=0; i<nfp.length; i++){
		var clip = nfpToClipperCoordinates(nfp[i], config);
		clipperNfp = clipperNfp.concat(clip);
	}
	
	return clipperNfp;
}

function toNestCoordinates(polygon, scale){
	var clone = [];
	for(var i=0; i<polygon.length; i++){
		clone.push({
			x: polygon[i].X/scale,
			y: polygon[i].Y/scale
		});
	}
	
	return clone;
};

function getHull(polygon){
	// convert to hulljs format
	/*var hull = new ConvexHullGrahamScan();
	for(var i=0; i<polygon.length; i++){
		hull.addPoint(polygon[i].x, polygon[i].y);
	}
	
	return hull.getHull();*/
	var points = [];
	for(var i=0; i<polygon.length; i++){
		points.push([polygon[i].x, polygon[i].y]);
	}
	var hullpoints = d3.polygonHull(points);
	
	if(!hullpoints){
		return polygon;
	}
	
	var hull = [];
	for(i=0; i<hullpoints.length; i++){
		hull.push({x: hullpoints[i][0], y: hullpoints[i][1]});
	}
	
	return hull;
}

function rotatePolygon(polygon, degrees){
	var rotated = [];
	var angle = degrees * Math.PI / 180;
	for(var i=0; i<polygon.length; i++){
		var x = polygon[i].x;
		var y = polygon[i].y;
		var x1 = x*Math.cos(angle)-y*Math.sin(angle);
		var y1 = x*Math.sin(angle)+y*Math.cos(angle);
						
		rotated.push({x:x1, y:y1, exact: polygon[i].exact});
	}
	
	if(polygon.children && polygon.children.length > 0){
		rotated.children = [];
		for(var j=0; j<polygon.children.length; j++){
			rotated.children.push(rotatePolygon(polygon.children[j], degrees));
		}
	}
	
	return rotated;
};

function getOuterNfp(A, B, inside){
	var nfp;
	
	/*var numpoly = A.length + B.length;
	if(A.children && A.children.length > 0){
		A.children.forEach(function(c){
			numpoly += c.length;
		});
	}
	if(B.children && B.children.length > 0){
		B.children.forEach(function(c){
			numpoly += c.length;
		});
	}*/
	
	// try the file cache if the calculation will take a long time
	var doc = window.db.find({ A: A.source, B: B.source, Arotation: A.rotation, Brotation: B.rotation });
	if(typeof cmNestProfile !== 'undefined' && cmNestProfile){cmProfileAddCount('outerCacheLookups',1);cmProfileAddCount(doc?'outerCacheHits':'outerCacheMisses',1);}
	
	if(doc){
		return doc;
	}

	// not found in cache
	if(inside || (A.children && A.children.length > 0)){
	//console.log('computing minkowski: ',A.length, B.length);
	//console.time('addon');
	nfp = addon.calculateNFP({A: A, B: B});
	//console.timeEnd('addon');
	}
	else{
		console.log('minkowski', A.length, B.length, A.source, B.source);
		console.time('clipper');
	
		var Ac = toClipperCoordinates(A);
		ClipperLib.JS.ScaleUpPath(Ac, 10000000);
		var Bc = toClipperCoordinates(B);
		ClipperLib.JS.ScaleUpPath(Bc, 10000000);
		for(var i=0; i<Bc.length; i++){
			Bc[i].X *= -1;
			Bc[i].Y *= -1;
		}
		var solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
		//console.log(solution.length, solution);
		//var clipperNfp = toNestCoordinates(solution[0], 10000000);
		var clipperNfp;
		
		var largestArea = null;
		for(i=0; i<solution.length; i++){
			var n = toNestCoordinates(solution[i], 10000000);
			var sarea = -GeometryUtil.polygonArea(n);
			if(largestArea === null || largestArea < sarea){
				clipperNfp = n;
				largestArea = sarea;
			}
		}
		
		for(var i=0; i<clipperNfp.length; i++){
			clipperNfp[i].x += B[0].x;
			clipperNfp[i].y += B[0].y;
		}
		
		nfp = [clipperNfp];
		//console.log('clipper nfp', JSON.stringify(nfp));
		console.timeEnd('clipper');
	}
	
	if(!nfp || nfp.length == 0){
		//console.log('holy shit', nfp, A, B, JSON.stringify(A), JSON.stringify(B));
		return null
	}
	
	nfp = nfp.pop();
	
	if(!nfp || nfp.length == 0){
		return null;
	}
	
	if(!inside && typeof A.source !== 'undefined' && typeof B.source !== 'undefined'){
		// insert into db
		doc = {
			A: A.source,
			B: B.source,
			Arotation: A.rotation,
			Brotation: B.rotation,
			nfp: nfp
		};
		window.db.insert(doc);
	}
	
	return nfp;
}

function getFrame(A){
	var bounds = GeometryUtil.getPolygonBounds(A);
	
	// expand bounds by 10%
	bounds.width *= 1.1; 
	bounds.height *= 1.1;
	bounds.x -= 0.5*(bounds.width - (bounds.width/1.1));
	bounds.y -= 0.5*(bounds.height - (bounds.height/1.1));
	
	var frame = [];
	frame.push({ x: bounds.x, y: bounds.y });
	frame.push({ x: bounds.x+bounds.width, y: bounds.y });
	frame.push({ x: bounds.x+bounds.width, y: bounds.y+bounds.height });
	frame.push({ x: bounds.x, y: bounds.y+bounds.height });
	
	frame.children = [A];
	frame.source = A.source;
	frame.rotation = 0;
	
	return frame;
}

// Experimental rectangular inner-NFP mode. The main process resolves the
// environment override and sends a fixed mode with each nesting job's evaluations.
// The environment fallback keeps the existing diagnostic launch path available.
var cmRectInnerNfpMode = 'off';
try{
	var requestedRectMode = String(process.env.CM_RECT_NFP_MODE || 'off').trim().toLowerCase();
	if(requestedRectMode === 'compare' || requestedRectMode === 'fast'){
		cmRectInnerNfpMode = requestedRectMode;
	}
}catch(e){}

var cmRectInnerNfpDiagnostics = { mode: cmRectInnerNfpMode, compared: 0, different: 0, logged: 0, last: null };
window.cmRectInnerNfpDiagnostics = cmRectInnerNfpDiagnostics;

function cmRectFiniteRing(poly){
	if(!Array.isArray(poly)) return null;
	var count = poly.length;
	if(count > 1 && poly[0] && poly[count-1] && poly[0].x === poly[count-1].x && poly[0].y === poly[count-1].y) count--;
	if(count < 3 || count > 256) return null;
	var points = [];
	for(var i=0; i<count; i++){
		var p = poly[i];
		if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
		var previous = poly[(i+count-1)%count];
		if(!previous || (p.x === previous.x && p.y === previous.y)) return null;
		points.push(p);
	}
	var area = GeometryUtil.polygonArea(points);
	if(!Number.isFinite(area) || area === 0) return null;
	// Reject self-intersecting and touching non-adjacent edges; do not guess at
	// containment for malformed piece geometry.
	for(var a=0; a<count; a++){
		var a1=points[a], a2=points[(a+1)%count];
		for(var b=a+1; b<count; b++){
			if(b === a || b === (a+1)%count || (b+1)%count === a) continue;
			var b1=points[b], b2=points[(b+1)%count];
			var d1=(a2.x-a1.x)*(b1.y-a1.y)-(a2.y-a1.y)*(b1.x-a1.x);
			var d2=(a2.x-a1.x)*(b2.y-a1.y)-(a2.y-a1.y)*(b2.x-a1.x);
			var d3=(b2.x-b1.x)*(a1.y-b1.y)-(b2.y-b1.y)*(a1.x-b1.x);
			var d4=(b2.x-b1.x)*(a2.y-b1.y)-(b2.y-b1.y)*(a2.x-b1.x);
			if(((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return null;
			if(d1 === 0 || d2 === 0 || d3 === 0 || d4 === 0){
				var minAx=Math.min(a1.x,a2.x), maxAx=Math.max(a1.x,a2.x), minAy=Math.min(a1.y,a2.y), maxAy=Math.max(a1.y,a2.y);
				var minBx=Math.min(b1.x,b2.x), maxBx=Math.max(b1.x,b2.x), minBy=Math.min(b1.y,b2.y), maxBy=Math.max(b1.y,b2.y);
				if(maxAx >= minBx && maxBx >= minAx && maxAy >= minBy && maxBy >= minAy) return null;
			}
		}
	}
	return points;
}

function cmRectPointInRing(point, ring){
	var inside=false;
	for(var i=0,j=ring.length-1; i<ring.length; j=i++){
		var a=ring[j], b=ring[i];
		if(((b.y > point.y) !== (a.y > point.y)) && point.x < (a.x-b.x)*(point.y-b.y)/(a.y-b.y)+b.x) inside=!inside;
	}
	return inside;
}

function cmRectRingsIntersect(a, b){
	function orient(p,q,r){ return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x); }
	function onSegment(p,q,r){ return q.x>=Math.min(p.x,r.x) && q.x<=Math.max(p.x,r.x) && q.y>=Math.min(p.y,r.y) && q.y<=Math.max(p.y,r.y); }
	for(var i=0;i<a.length;i++){
		var p1=a[i], p2=a[(i+1)%a.length];
		for(var j=0;j<b.length;j++){
			var q1=b[j], q2=b[(j+1)%b.length];
			var o1=orient(p1,p2,q1), o2=orient(p1,p2,q2), o3=orient(q1,q2,p1), o4=orient(q1,q2,p2);
			if(((o1>0 && o2<0)||(o1<0 && o2>0)) && ((o3>0 && o4<0)||(o3<0 && o4>0))) return true;
			if((o1===0 && onSegment(p1,q1,p2)) || (o2===0 && onSegment(p1,q2,p2)) || (o3===0 && onSegment(q1,p1,q2)) || (o4===0 && onSegment(q1,p2,q2))) return true;
		}
	}
	return false;
}

function cmRectChildrenContained(parent, children){
	if(!children) return true;
	if(!Array.isArray(children)) return false;
	for(var i=0;i<children.length;i++){
		var ring=cmRectFiniteRing(children[i]);
		if(!ring || cmRectRingsIntersect(parent,ring)) return false;
		for(var j=0;j<ring.length;j++) if(!cmRectPointInRing(ring[j],parent)) return false;
		if(!cmRectChildrenContained(ring,children[i].children)) return false;
	}
	return true;
}

function cmTryRectangularInnerNfp(A, B, config){
	function reject(reason){ return { nfp:null, reason:reason }; }
	if(!Array.isArray(A) || !Array.isArray(B)) return reject('not-arrays');
	if(A.children !== undefined && !Array.isArray(A.children)) return reject('invalid-sheet-children');
	if(A.children && A.children.length) return reject('sheet-has-holes');
	if(A.rotation !== undefined && A.rotation !== 0) return reject('sheet-rotation');
	if(!Number.isFinite(B.rotation)) return reject('invalid-part-rotation');
	var scale=config && config.clipperScale;
	if(!Number.isFinite(scale) || scale <= 0) return reject('invalid-clipper-scale');
	var count=A.length;
	if(count===5 && A[0] && A[4] && A[0].x===A[4].x && A[0].y===A[4].y) count=4;
	if(count!==4) return reject('sheet-vertex-count');
	for(var i=0;i<count;i++) if(!A[i] || !Number.isFinite(A[i].x) || !Number.isFinite(A[i].y)) return reject('non-finite-sheet-coordinate');
	var ab=GeometryUtil.getPolygonBounds(A), xmax=ab.x+ab.width, ymax=ab.y+ab.height;
	if(![ab.x,ab.y,ab.width,ab.height,xmax,ymax].every(Number.isFinite) || ab.width<=0 || ab.height<=0) return reject('invalid-sheet-bounds');
	var corners=new Set();
	for(i=0;i<count;i++){
		if((A[i].x!==ab.x && A[i].x!==xmax) || (A[i].y!==ab.y && A[i].y!==ymax)) return reject('sheet-not-axis-aligned-rectangle');
		var next=A[(i+1)%count];
		if((A[i].x!==next.x && A[i].y!==next.y) || (A[i].x===next.x && A[i].y===next.y)) return reject('invalid-sheet-edge');
		corners.add(A[i].x+','+A[i].y);
	}
	if(corners.size!==4) return reject('invalid-sheet-corners');
	var outer=cmRectFiniteRing(B);
	if(!outer) return reject('invalid-or-complex-part-ring');
	if(!cmRectChildrenContained(outer,B.children)) return reject('invalid-or-complex-part-hole');
	var bb=GeometryUtil.getPolygonBounds(outer);
	if(![bb.x,bb.y,bb.width,bb.height,bb.x+bb.width,bb.y+bb.height].every(Number.isFinite) || bb.width<=0 || bb.height<=0) return reject('invalid-part-bounds');
	var scaledBounds=[ab.x,ab.y,xmax,ymax,bb.x,bb.y,bb.x+bb.width,bb.y+bb.height].map(function(value){return value*scale;});
	if(!scaledBounds.every(function(value){return Number.isFinite(value) && Math.abs(value)<Number.MAX_SAFE_INTEGER-16;})) return reject('scaled-coordinate-out-of-safe-range');
	var clearanceX=ab.width-bb.width, clearanceY=ab.height-bb.height;
	// Keep a four-grid-unit minimum raw clearance, then retain at least two
	// grid units between the one-unit-inset endpoints. Exact/near-grid fits use
	// the general addon path rather than a degenerate rectangular NFP.
	if(!Number.isFinite(clearanceX) || !Number.isFinite(clearanceY) || clearanceX*scale<=4 || clearanceY*scale<=4) return reject('clearance-near-clipper-grid');
	var x0=(Math.ceil((ab.x-bb.x)*scale)+1)/scale;
	var y0=(Math.ceil((ab.y-bb.y)*scale)+1)/scale;
	var x1=(Math.floor((xmax-(bb.x+bb.width))*scale)-1)/scale;
	var y1=(Math.floor((ymax-(bb.y+bb.height))*scale)-1)/scale;
	if(![x0,y0,x1,y1].every(Number.isFinite) || x1-x0<2/scale || y1-y0<2/scale) return reject('degenerate-inset-region');
	// Return B[0] placement coordinates, matching the clockwise general-NFP
	// convention. Clipper closes paths itself, so do not repeat the first point.
	var bx=B[0].x, by=B[0].y;
	var nfp=[[{x:x1+bx,y:y1+by},{x:x1+bx,y:y0+by},{x:x0+bx,y:y0+by},{x:x0+bx,y:y1+by}]];
	if(!nfp[0].every(function(p){return Number.isFinite(p.x)&&Number.isFinite(p.y);})) return reject('non-finite-result');
	return {nfp:nfp,reason:null};
}

function cmNfpSummary(nfp, B){
	if(!nfp || !nfp.length) return {polygons:0,vertices:0,area:0,bounds:null,first:null,orientation:[],vertexSet:[]};
	var points=[], area=0, vertices=0, orientation=[], vertexSet=[];
	for(var i=0;i<nfp.length;i++){
		var count=nfp[i].length;
		if(count>1 && nfp[i][0].x===nfp[i][count-1].x && nfp[i][0].y===nfp[i][count-1].y) count--;
		vertices+=count;
		var polygonArea=GeometryUtil.polygonArea(nfp[i]);
		area+=Math.abs(polygonArea);
		orientation.push(polygonArea>0?1:(polygonArea<0?-1:0));
		for(var j=0;j<count;j++){
			points.push(nfp[i][j]);
			vertexSet.push(nfp[i][j].x+','+nfp[i][j].y);
		}
	}
	var bounds=points.length?GeometryUtil.getPolygonBounds(points):null, first=null;
	for(i=0;i<points.length;i++){
		var x=points[i].x-B[0].x, y=points[i].y-B[0].y;
		if(!first || x<first.x || (GeometryUtil.almostEqual(x,first.x) && y<first.y)) first={x:x,y:y};
	}
	vertexSet.sort();
	return {polygons:nfp.length,vertices:vertices,area:area,bounds:bounds,first:first,orientation:orientation,vertexSet:vertexSet};
}

function cmCompareRectNfp(rectNfp, generalNfp, B, reason){
	var rect=cmNfpSummary(rectNfp,B), general=cmNfpSummary(generalNfp,B);
	var delta={area:Math.abs(rect.area-general.area),bounds:null,first:null};
	if(rect.bounds && general.bounds) delta.bounds={
		x:Math.max(Math.abs(rect.bounds.x-general.bounds.x),Math.abs((rect.bounds.x+rect.bounds.width)-(general.bounds.x+general.bounds.width))),
		y:Math.max(Math.abs(rect.bounds.y-general.bounds.y),Math.abs((rect.bounds.y+rect.bounds.height)-(general.bounds.y+general.bounds.height)))
	};
	if(rect.first && general.first) delta.first={x:Math.abs(rect.first.x-general.first.x),y:Math.abs(rect.first.y-general.first.y)};
	var different=rect.polygons!==general.polygons || rect.vertices!==general.vertices || JSON.stringify(rect.vertexSet)!==JSON.stringify(general.vertexSet) || JSON.stringify(rect.orientation)!==JSON.stringify(general.orientation) || delta.area>0 || !delta.bounds || delta.bounds.x>0 || delta.bounds.y>0 || !delta.first || delta.first.x>0 || delta.first.y>0;
	var d=cmRectInnerNfpDiagnostics;
	d.compared++; if(different) d.different++;
	d.last={different:different,reason:reason||null,rect:rect,general:general,delta:delta};
	if(different && d.logged<3){
		d.logged++;
		console.info('[C&M experimental rectangular NFP]',JSON.stringify(d.last));
	}
}

function getInnerNfp(A, B, config){
	var rectResult=null;
	if(cmRectInnerNfpMode==='compare'){if(typeof cmNestProfile !== 'undefined' && cmNestProfile)cmProfileAddCount('rectCompareAttempts',1);rectResult=cmTryRectangularInnerNfp(A,B,config);}
	if(typeof A.source !== 'undefined' && typeof B.source !== 'undefined'){
		var doc = window.db.find({ A: A.source, B: B.source, Arotation: 0, Brotation: B.rotation }, true);
		if(typeof cmNestProfile !== 'undefined' && cmNestProfile){cmProfileAddCount('innerCacheLookups',1);cmProfileAddCount(doc?'innerCacheHits':'innerCacheMisses',1);}
	
		if(doc){
			if(rectResult && rectResult.nfp) cmCompareRectNfp(rectResult.nfp,doc,B,null);
			return doc;
		}
	}

	if(cmRectInnerNfpMode==='fast'){
		rectResult=cmTryRectangularInnerNfp(A,B,config);
		if(rectResult.nfp){if(typeof cmNestProfile !== 'undefined' && cmNestProfile)cmProfileAddCount('rectFastUsed',1);return rectResult.nfp;}
		if(typeof cmNestProfile !== 'undefined' && cmNestProfile)cmProfileAddCount('rectFallback',1);
	}
	
	var frame = getFrame(A);
	
	var nfp = getOuterNfp(frame, B, true);
		
	if(!nfp || !nfp.children || nfp.children.length == 0){
		if(cmRectInnerNfpMode==='compare' && rectResult && rectResult.nfp) cmCompareRectNfp(rectResult.nfp,null,B,'general-returned-null');
		return null;
	}
	
	var holes = [];
	if(A.children && A.children.length > 0){
		for(var i=0; i<A.children.length; i++){
			var hnfp = getOuterNfp(A.children[i], B);
			if(hnfp){
				holes.push(hnfp);
			}
		}
	}
		
	if(holes.length == 0){
		if(cmRectInnerNfpMode==='compare' && rectResult && rectResult.nfp) cmCompareRectNfp(rectResult.nfp,nfp.children,B,null);
		return nfp.children;
	}
	
	var clipperNfp = innerNfpToClipperCoordinates(nfp.children, config);
	var clipperHoles = innerNfpToClipperCoordinates(holes, config);
	
	var finalNfp = new ClipperLib.Paths();
	var clipper = new ClipperLib.Clipper();
	
	clipper.AddPaths(clipperHoles, ClipperLib.PolyType.ptClip, true);
	clipper.AddPaths(clipperNfp, ClipperLib.PolyType.ptSubject, true);
	
	if(!clipper.Execute(ClipperLib.ClipType.ctDifference, finalNfp, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)){
		return nfp.children;
	}
	
	if(finalNfp.length == 0){
		return null;
	}
	
	var f = [];
	for(var i=0; i<finalNfp.length; i++){
		f.push(toNestCoordinates(finalNfp[i], config.clipperScale));
	}
	
	if(typeof A.source !== 'undefined' && typeof B.source !== 'undefined'){
		// insert into db
		console.log('inserting inner: ',A.source, B.source, B.rotation, f);
		var doc = {
			A: A.source,
			B: B.source,
			Arotation: 0,
			Brotation: B.rotation,
			nfp: f
		};
		window.db.insert(doc, true);
	}
	
	return f;
}

function placeParts(sheets, parts, config, nestindex){

	if(!sheets){
		return null;
	}
	
	var i, j, k, m, n, part;
	
	var totalnum = parts.length;
	var totalsheetarea = 0;
	
	// total length of merged lines
	var totalMerged = 0;
		
	// rotate paths by given rotation
	var rotated = [];
	for(i=0; i<parts.length; i++){
		var r = rotatePolygon(parts[i], parts[i].rotation);
		r.rotation = parts[i].rotation;
		r.source = parts[i].source;
		r.id = parts[i].id;
		
		rotated.push(r);
	}
	
	parts = rotated;
	
	var allplacements = [];
	var fitness = 0;
	//var binarea = Math.abs(GeometryUtil.polygonArea(self.binPolygon));
	
	var key, nfp;
	var part;
	
	while(parts.length > 0){
		
		var placed = [];
		var placements = [];
		
		// open a new sheet
		var sheet = sheets.shift();
		var sheetarea = Math.abs(GeometryUtil.polygonArea(sheet));
		totalsheetarea += sheetarea;
		
		fitness += sheetarea; // add 1 for each new sheet opened (lower fitness is better)
		
		var clipCache = [];
		//console.log('new sheet');
		for(i=0; i<parts.length; i++){
			// Placement timing disabled: early continue paths leave console timers open.
			part = parts[i];
			
			// inner NFP
			var sheetNfp = null;				
			// try all possible rotations until it fits
			// (only do this for the first part of each sheet, to ensure that all parts that can be placed are, even if we have to to open a lot of sheets)
			for(j=0; j<(360/config.rotations); j++){
				sheetNfp = getInnerNfp(sheet, part, config);
				
				if(sheetNfp){
					break;
				}
				
				var r = rotatePolygon(part, 360/config.rotations);
				r.rotation = part.rotation + (360/config.rotations);
				r.source = part.source;
				r.id = part.id;
				
				// rotation is not in-place
				part = r;
				parts[i] = r;
				
				if(part.rotation > 360){
					part.rotation = part.rotation%360;
				}
			}
			// part unplaceable, skip
			if(!sheetNfp || sheetNfp.length == 0){
				continue;
			}
						
			var position = null;
			
			if(placed.length == 0){
				// first placement, put it on the top left corner
				for(j=0; j<sheetNfp.length; j++){
					for(k=0; k<sheetNfp[j].length; k++){
						if(position === null || sheetNfp[j][k].x-part[0].x < position.x || (GeometryUtil.almostEqual(sheetNfp[j][k].x-part[0].x, position.x) && sheetNfp[j][k].y-part[0].y < position.y ) ){
							position = {
								x: sheetNfp[j][k].x-part[0].x,
								y: sheetNfp[j][k].y-part[0].y,
								id: part.id,
								rotation: part.rotation,
								source: part.source
							}
						}
					}
				}
				if(position === null){
					console.log(sheetNfp);
				}
				placements.push(position);
				placed.push(part);
				
				continue;
			}
			
			var clipperSheetNfp = innerNfpToClipperCoordinates(sheetNfp, config);
			
			var clipper = new ClipperLib.Clipper();
			var combinedNfp = new ClipperLib.Paths();
			
			var error = false;
			
			// check if stored in clip cache
			//var startindex = 0;
			var clipkey = 's:'+part.source+'r:'+part.rotation;
			var startindex = 0;
			if(clipCache[clipkey]){
				if(typeof cmNestProfile !== 'undefined' && cmNestProfile)cmProfileAddCount('placeClipCacheHits',1);
				var prevNfp = clipCache[clipkey].nfp;
				clipper.AddPaths(prevNfp, ClipperLib.PolyType.ptSubject, true);
				startindex = clipCache[clipkey].index;
			}
			else if(typeof cmNestProfile !== 'undefined' && cmNestProfile) cmProfileAddCount('placeClipCacheMisses',1);
			
			for(j=startindex; j<placed.length; j++){
				nfp = getOuterNfp(placed[j], part);
				// minkowski difference failed. very rare but could happen
				if(!nfp){
					error = true;
					break;
				}
				// shift to placed location
				for(m=0; m<nfp.length; m++){
					nfp[m].x += placements[j].x;
					nfp[m].y += placements[j].y;
				}
				
				if(nfp.children && nfp.children.length > 0){
					for(n=0; n<nfp.children.length; n++){
						for(var o=0; o<nfp.children[n].length; o++){
							nfp.children[n][o].x += placements[j].x;
							nfp.children[n][o].y += placements[j].y;
						}
					}
				}
				
				var clipperNfp = nfpToClipperCoordinates(nfp, config);
				
				clipper.AddPaths(clipperNfp, ClipperLib.PolyType.ptSubject, true);
			}
			
			if(error || !clipper.Execute(ClipperLib.ClipType.ctUnion, combinedNfp, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)){
				console.log('clipper error', error);
				continue;
			}
			
			/*var converted = [];
			for(j=0; j<combinedNfp.length; j++){
				converted.push(toNestCoordinates(combinedNfp[j], config.clipperScale));
			}*/
			
			clipCache[clipkey] = {
				nfp: combinedNfp,
				index: placed.length-1
			};
			
			console.log('save cache', placed.length-1);
			
			// difference with sheet polygon
			var finalNfp = new ClipperLib.Paths();
			clipper = new ClipperLib.Clipper();
			
			clipper.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true);
			
			clipper.AddPaths(clipperSheetNfp, ClipperLib.PolyType.ptSubject, true);
			
			if(!clipper.Execute(ClipperLib.ClipType.ctDifference, finalNfp, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftNonZero)){
				continue;
			}
			
			if(!finalNfp || finalNfp.length == 0){
				continue;
			}
			
			var f = [];
			for(j=0; j<finalNfp.length; j++){
				// back to normal scale
				f.push(toNestCoordinates(finalNfp[j], config.clipperScale));
			}
			finalNfp = f;
						
			// choose placement that results in the smallest bounding box/hull etc
			// todo: generalize gravity direction
			var minwidth = null;
			var minarea = null;
			var minx = null;
			var miny = null;
			var nf, area, shiftvector;
			
			var allpoints = [];
			for(m=0; m<placed.length; m++){
				for(n=0; n<placed[m].length; n++){
					allpoints.push({x:placed[m][n].x+placements[m].x, y: placed[m][n].y+placements[m].y});
				}
			}
			
			var allbounds;
			var partbounds;
			if(config.placementType == 'gravity' || config.placementType == 'box'){
				allbounds = GeometryUtil.getPolygonBounds(allpoints);
				
				var partpoints = [];
				for(m=0; m<part.length; m++){
					partpoints.push({x: part[m].x, y:part[m].y});
				}
				partbounds = GeometryUtil.getPolygonBounds(partpoints);
			}
			else{
				allpoints = getHull(allpoints);
			}
			for(j=0; j<finalNfp.length; j++){
				nf = finalNfp[j];
				//console.log('evalnf',nf.length);
				for(k=0; k<nf.length; k++){
					
					shiftvector = {
						x: nf[k].x-part[0].x,
						y: nf[k].y-part[0].y,
						id: part.id,
						source: part.source,
						rotation: part.rotation
					};
					
					
					/*for(m=0; m<part.length; m++){
						localpoints.push({x: part[m].x+shiftvector.x, y:part[m].y+shiftvector.y});
					}*/
					//console.time('evalbounds');
					
					if(config.placementType == 'gravity' || config.placementType == 'box'){
						var rectbounds = GeometryUtil.getPolygonBounds([
							// allbounds points
							{x: allbounds.x, y:allbounds.y},
							{x: allbounds.x+allbounds.width, y:allbounds.y},
							{x: allbounds.x+allbounds.width, y:allbounds.y+allbounds.height},
							{x: allbounds.x, y:allbounds.y+allbounds.height},
							
							// part points
							{x: partbounds.x+shiftvector.x, y:partbounds.y+shiftvector.y},
							{x: partbounds.x+partbounds.width+shiftvector.x, y:partbounds.y+shiftvector.y},
							{x: partbounds.x+partbounds.width+shiftvector.x, y:partbounds.y+partbounds.height+shiftvector.y},
							{x: partbounds.x+shiftvector.x, y:partbounds.y+partbounds.height+shiftvector.y}
						]);
						
						// weigh width more, to help compress in direction of gravity
						if(config.placementType == 'gravity'){
							area = rectbounds.width*2 + rectbounds.height;
						}
						else{
							area = rectbounds.width * rectbounds.height;
						}
					}
					else{
						// must be convex hull
						var localpoints = clone(allpoints);
						
						for(m=0; m<part.length; m++){
							localpoints.push({x: part[m].x+shiftvector.x, y:part[m].y+shiftvector.y});
						}
						
						area = Math.abs(GeometryUtil.polygonArea(getHull(localpoints)));
						shiftvector.hull = getHull(localpoints);
						shiftvector.hullsheet = getHull(sheet);
					}
					
					//console.timeEnd('evalbounds');
					//console.time('evalmerge');
					
					if(config.mergeLines){
						// if lines can be merged, subtract savings from area calculation						
						var shiftedpart = shiftPolygon(part, shiftvector);
						var shiftedplaced = [];
						
						for(m=0; m<placed.length; m++){
							shiftedplaced.push(shiftPolygon(placed[m], placements[m]));
						}
						
						// don't check small lines, cut off at about 1/2 in
						var minlength = 0.5*config.scale;
						var merged = mergedLength(shiftedplaced, shiftedpart, minlength, 0.1*config.curveTolerance);
						area -= merged.totalLength*config.timeRatio;
					}
					
					//console.timeEnd('evalmerge');
					
					if(
					minarea === null || 
					area < minarea || 
					(GeometryUtil.almostEqual(minarea, area) && (minx === null || shiftvector.x < minx)) ||
					(GeometryUtil.almostEqual(minarea, area) && (minx !== null && GeometryUtil.almostEqual(shiftvector.x, minx) && shiftvector.y < miny))
					){
						minarea = area;
						minwidth = rectbounds ? rectbounds.width : 0;
						position = shiftvector;
						if(minx === null || shiftvector.x < minx){
							minx = shiftvector.x;
						}
						if(miny === null || shiftvector.y < miny){
							miny = shiftvector.y;
						}
						
						if(config.mergeLines){
							position.mergedLength = merged.totalLength;
							position.mergedSegments = merged.segments;
						}
					}
				}
			}
			
			if(position){
				placed.push(part);
				placements.push(position);
				if(position.mergedLength){
					totalMerged += position.mergedLength;
				}
			}
			
			// send placement progress signal
			var placednum = placed.length;
			for(j=0; j<allplacements.length; j++){
				placednum += allplacements[j].sheetplacements.length;
			}
			//console.log(placednum, totalnum);
			ipcRenderer.send('background-progress', {index: nestindex, progress: 0.5 + 0.5*(placednum/totalnum)});
			// End of placement iteration.
		}
		
		//if(minwidth){
		fitness += (minwidth/sheetarea) + minarea;
		//}
		
		for(i=0; i<placed.length; i++){
			var index = parts.indexOf(placed[i]);
			if(index >= 0){
				parts.splice(index,1);
			}
		}
		
		if(placements && placements.length > 0){
			allplacements.push({sheet: sheet.source, sheetid: sheet.id, sheetplacements: placements});
		}
		else{
			break; // something went wrong
		}
		
		if(sheets.length == 0){
			break;
		}
	}
	
	// there were parts that couldn't be placed
	// scale this value high - we really want to get all the parts in, even at the cost of opening new sheets
	for(i=0; i<parts.length; i++){
		fitness += 100000000*(Math.abs(GeometryUtil.polygonArea(parts[i]))/totalsheetarea);
	}
	// send finish progerss signal
	ipcRenderer.send('background-progress', {index: nestindex, progress: -1});
	
	return {placements: allplacements, fitness: fitness, area: sheetarea, mergedLength: totalMerged };
}

// clipperjs uses alerts for warnings
function alert(message) { 
    console.log('alert: ', message);
}
