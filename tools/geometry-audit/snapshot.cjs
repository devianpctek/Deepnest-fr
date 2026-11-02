'use strict';

function serializeTree(tree, label) {
  if (!Array.isArray(tree) || tree.length < 3) throw new Error('Geometría ausente o no poligonal: ' + label);
  const points = tree.map((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Coordenada no finita en ' + label + '[' + i + ']');
    return { x: p.x, y: p.y };
  });
  const children = tree.children || [];
  if (!Array.isArray(children)) throw new Error('Relaciones de contorno inválidas: ' + label);
  return { points, children: children.map((child, i) => serializeTree(child, label + '.children[' + i + ']')) };
}

function getSelectedNest(nests) {
  if (!Array.isArray(nests)) return null;
  return nests.filter(n => n && n.selected).pop() || null;
}

function createSnapshot(args) {
  const parts = args.parts, nest = args.nest, cfg = args.configuration;
  if (!Number.isInteger(args.jobId) || !['off', 'fast'].includes(args.mode)) throw new Error('Identidad o modo de trabajo ausente');
  if (!Array.isArray(parts) || !Array.isArray(nest && nest.placements) || !cfg) throw new Error('Faltan partes, solución o configuración');
  const scale = Number(cfg.scale), clipperScale = Number(cfg.clipperScale), spacing = Number(cfg.spacing), curveTolerance = Number(cfg.curveTolerance);
  if (!(Number.isFinite(scale) && scale > 0 && Number.isFinite(clipperScale) && clipperScale > 0 && Number.isFinite(spacing) && spacing >= 0 && Number.isFinite(curveTolerance) && curveTolerance > 0)) throw new Error('Escala, tolerancia o separación inválida');
  const products = [], physicalSheets = [], expectedInstances = [];
  let nextId = 0;
  parts.forEach((part, source) => {
    if (!part || !Number.isInteger(source)) throw new Error('Catálogo de piezas inválido');
    if (part.sheet) return;
    const quantity = Number(part.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Cantidad inválida para source ' + source);
    products.push({ source, quantity, kind: 'part', tree: serializeTree(part.polygontree, 'parts[' + source + ']') });
    for (let i = 0; i < quantity; i++) expectedInstances.push({ id: nextId++, source });
  });
  const placements = [];
  nest.placements.forEach((sheet, groupIndex) => {
    if (!sheet || !Number.isInteger(Number(sheet.sheet))) throw new Error('Referencia de geometría de hoja ausente');
    const source = Number(sheet.sheet), src = parts[source];
    if (!src || !src.sheet) throw new Error('La hoja referencia un source inválido: ' + source);
    // A result entry is one physical sheet used by placeParts. The engine's
    // sheetid can be aliased when virtual sheets share one polygon reference.
    const diagnosticSheetId = groupIndex;
    const engineSheetId = Number.isInteger(sheet.sheetid) ? sheet.sheetid : null;
    physicalSheets.push({ sheetid: diagnosticSheetId, engineSheetId, source, tree: serializeTree(src.polygontree, 'sheets[' + diagnosticSheetId + ']') });
    (sheet.sheetplacements || []).forEach(p => {
      if (!p || !Number.isInteger(Number(p.id)) || !Number.isInteger(Number(p.source)) || ![p.x,p.y,p.rotation].every(Number.isFinite)) throw new Error('Transformación o identificador de colocación inválido');
      placements.push({ id: Number(p.id), source: Number(p.source), x: p.x, y: p.y, rotation: p.rotation, sheetid: diagnosticSheetId, engineSheetId, sheet: source });
    });
  });
  const margin = cfg.sheetMarginMm === undefined ? 0 : Number(cfg.sheetMarginMm);
  if (!Number.isFinite(margin) || margin < 0) throw new Error('Margen de hoja inválido');
  return {
    schema: 'deepnest-cm-geometry-audit-input/v2', jobId: args.jobId, mode: args.mode,
    coordinateSpace: 'deepnest-svg-units', geometryStage: 'source-unoffset-polygon-tree',
    geometryProvenance: 'DeepNest.parts.polygontree after SvgParser polygonify/cleanPolygon; before the temporary spacing offsets in DeepNest.start',
    configuration: { unitsPerInch: scale, clipperScale, curveToleranceSourceUnits: curveTolerance, spacingMm: spacing * 25.4 / scale, spacingSourceUnits: spacing, sheetMarginMm: margin, sheetMarginSource: cfg.sheetMarginMm === undefined ? 'no-setting-in-application; zero' : 'configuration' },
    parts: products, sheets: physicalSheets, expectedInstances, placements
  };
}

module.exports = { createSnapshot, serializeTree, getSelectedNest };
