'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, '..', '..', 'main', 'background.js'), 'utf8');
const helper = source.match(/var cmTotalTimerSequence = 0;\s*function cmNextTotalTimerLabel\(\)\s*\{[\s\S]*?\n\}/);
assert(helper, 'Debe existir el generador monotónico de etiquetas Total');

const context = vm.createContext({});
vm.runInContext(helper[0], context);
const labels = [context.cmNextTotalTimerLabel(), context.cmNextTotalTimerLabel(), context.cmNextTotalTimerLabel()];
assert.strictEqual(new Set(labels).size, labels.length, 'Cada evaluación concurrente debe obtener una etiqueta única');

assert.strictEqual((source.match(/console\.time\(totalTimerLabel\)/g) || []).length, 1, 'El timer debe iniciarse con su etiqueta local');
assert.strictEqual((source.match(/console\.timeEnd\(totalTimerLabel\)/g) || []).length, 2, 'Las ramas con y sin pares deben cerrar el timer local');
assert(!source.includes("console.time('Total')"), 'No debe quedar la etiqueta compartida Total');

console.log('PASS timer label regression: etiquetas únicas y cierre en ambas rutas');
