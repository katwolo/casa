/**
 * Menú de casa — backend (Code.gs)
 * Guarda recetas, planificación semanal y lista de la compra en una Google Sheet.
 *
 * Configuración necesaria antes de desplegar:
 *  1. Crea (o reutiliza) una Google Sheet vacía y copia su ID (el trozo largo de la URL).
 *  2. En el editor de Apps Script: Configuración del proyecto (⚙️) > Propiedades del script
 *     > Añadir propiedad de script: SPREADSHEET_ID = <el ID de tu Sheet>.
 *  3. Despliega como aplicación web (ver README.md).
 *
 * Las pestañas de la Sheet se crean solas la primera vez que se usan.
 */

var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function doGet(e) {
  var action = e.parameter && e.parameter.action;
  if (!action) {
    // Sin ?action=... en la URL: sirve la vista HTML directa (útil para probar desde script.google.com)
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Menú de casa')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    var result = routeAction_(action, e.parameter);
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var result = routeAction_(body.action, body.payload || {});
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_({ error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Punto único que traduce una "acción" (nombre + parámetros) a la función real.
// Las funciones de negocio de abajo no cambian nada.
function routeAction_(action, p) {
  switch (action) {
    case 'getRecipes': return getRecipes();
    case 'saveRecipe': return saveRecipe(p.recipe);
    case 'deleteRecipeById': return deleteRecipeById(p.id);
    case 'refreshRecipesCache': return refreshRecipesCache();
    case 'getWeekPlan': return getWeekPlan(p.weekId);
    case 'setWeekPlanCell': return setWeekPlanCell(p.weekId, p.dia, p.meal, p.recipeId);
    case 'setWeekPlan': return setWeekPlan(p.weekId, p.plan);
    case 'getShoppingExtras': return getShoppingExtras(p.weekId);
    case 'addShoppingExtra': return addShoppingExtra(p.weekId, p.item);
    case 'deleteShoppingExtra': return deleteShoppingExtra(p.weekId, p.extraId);
    case 'getShoppingChecked': return getShoppingChecked(p.weekId);
    case 'setShoppingChecked': return setShoppingChecked(p.weekId, p.itemKey, p.value);
    case 'clearShoppingChecked': return clearShoppingChecked(p.weekId);
    default: throw new Error('Acción desconocida: ' + action);
  }
}

// ---------- utilidades de hoja ----------

function getSS_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('Falta la propiedad de script SPREADSHEET_ID. Configúrala en Configuración del proyecto > Propiedades del script.');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name, headers) {
  var ss = getSS_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    if (headers[0] === 'weekId') {
      sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }
  }
  return sh;
}

// rowFilter (opcional) recibe la fila cruda (array, antes de mapearla a
// objeto) y decide si se conserva. Filtrar en este punto evita construir un
// objeto por cada fila del histórico cuando solo hace falta un weekId.
function sheetToObjects_(sh, rowFilter) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = values.slice(1).filter(function (r) { return r.join('') !== ''; });
  if (rowFilter) rows = rows.filter(rowFilter);
  return rows.map(function (r) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
}

// ---------- caché ----------
// Caché compartida entre usuarios: recetas y datos semanales cambian poco
// comparado con las veces que se leen, así que evitamos reabrir la Sheet y
// releer la hoja entera en cada carga. Se invalida explícitamente en cada
// escritura correspondiente, así que el TTL solo importa como red de
// seguridad (máximo que permite Apps Script).
var CACHE_TTL_ = 21600;

function cacheGet_(key) {
  var v = CacheService.getScriptCache().get(key);
  return v ? JSON.parse(v) : null;
}

function cachePut_(key, value) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), CACHE_TTL_);
  } catch (e) {
    // p.ej. valor por encima del límite de tamaño de la caché (100 KB):
    // mejor servir sin caché que romper la petición entera.
  }
}

function cacheRemove_(key) {
  CacheService.getScriptCache().remove(key);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Google Sheets a veces convierte automáticamente un texto tipo "2026-07-06"
// en una celda de tipo Fecha. Esta función deja el weekId siempre en el mismo
// formato de texto (yyyy-MM-dd), venga la celda como texto o como Fecha.
function normalizeWeekId_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

// ---------- RECETAS ----------
// Hoja "Recetas": id | nombre | tipo | ingredientesJSON | elaboracion | enlace
// (elaboracion es texto libre, un paso por línea; enlace es la URL del vídeo
// o web de origen, opcional. En hojas creadas antes de añadir alguna de estas
// columnas, hay que añadir la cabecera a mano en la celda correspondiente la
// primera vez — este código no reescribe cabeceras existentes.)

function getRecipes() {
  var cached = cacheGet_('recipes');
  if (cached) return cached;
  var sh = getSheet_('Recetas', ['id', 'nombre', 'tipo', 'ingredientesJSON', 'elaboracion', 'enlace']);
  var result = sheetToObjects_(sh).map(function (o) {
    var ingredients = [];
    try { ingredients = JSON.parse(o.ingredientesJSON || '[]'); } catch (e) {}
    return { id: String(o.id), name: o.nombre, meal: o.tipo, ingredients: ingredients, steps: o.elaboracion || '', link: o.enlace || '' };
  });
  cachePut_('recipes', result);
  return result;
}

function saveRecipe(recipe) {
  return withLock_(function () {
    var sh = getSheet_('Recetas', ['id', 'nombre', 'tipo', 'ingredientesJSON', 'elaboracion', 'enlace']);
    var data = sh.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(recipe.id)) { rowIndex = i + 1; break; }
    }
    var rowVals = [recipe.id, recipe.name, recipe.meal, JSON.stringify(recipe.ingredients || []), recipe.steps || '', recipe.link || ''];
    if (rowIndex > -1) {
      sh.getRange(rowIndex, 1, 1, 6).setValues([rowVals]);
    } else {
      sh.appendRow(rowVals);
    }
    cacheRemove_('recipes');
    return true;
  });
}

function deleteRecipeById(id) {
  return withLock_(function () {
    var sh = getSheet_('Recetas', ['id', 'nombre', 'tipo', 'ingredientesJSON', 'elaboracion', 'enlace']);
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(id)) sh.deleteRow(i + 1);
    }
    cacheRemove_('recipes');
    return true;
  });
}

// Fuerza una relectura de la hoja "Recetas", ignorando la caché de 6h.
// Necesario porque los edits manuales en la Sheet (fuera de la app) no
// pasan por saveRecipe/deleteRecipeById, así que no la invalidan solos.
function refreshRecipesCache() {
  cacheRemove_('recipes');
  return getRecipes();
}

// ---------- PLAN SEMANAL ----------
// Hoja "PlanSemanal": weekId | dia | comidaId | cenaId

function getWeekPlan(weekId) {
  var key = 'weekplan_' + weekId;
  var cached = cacheGet_(key);
  if (cached) return cached;
  var sh = getSheet_('PlanSemanal', ['weekId', 'dia', 'comidaId', 'cenaId']);
  var rows = sheetToObjects_(sh, function (r) { return normalizeWeekId_(r[0]) === String(weekId); });
  var plan = {};
  DIAS.forEach(function (d) { plan[d] = { comida: null, cena: null }; });
  rows.forEach(function (r) {
    if (plan[r.dia]) {
      plan[r.dia].comida = r.comidaId ? String(r.comidaId) : null;
      plan[r.dia].cena = r.cenaId ? String(r.cenaId) : null;
    }
  });
  cachePut_(key, plan);
  return plan;
}

function setWeekPlanCell(weekId, dia, meal, recipeId) {
  return withLock_(function () {
    var sh = getSheet_('PlanSemanal', ['weekId', 'dia', 'comidaId', 'cenaId']);
    var data = sh.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (normalizeWeekId_(data[i][0]) === String(weekId) && data[i][1] === dia) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) {
      var newRow = [weekId, dia, meal === 'comida' ? (recipeId || '') : '', meal === 'cena' ? (recipeId || '') : ''];
      sh.appendRow(newRow);
    } else {
      var col = meal === 'comida' ? 3 : 4;
      sh.getRange(rowIndex, col).setValue(recipeId || '');
    }
    cacheRemove_('weekplan_' + weekId);
    return true;
  });
}

// Guarda el plan de una semana completa (7 días x comida/cena) en una sola
// operación: un único bloqueo, una única lectura de la hoja y como mucho un
// puñado de escrituras, en vez de 14 llamadas independientes a setWeekPlanCell.
function setWeekPlan(weekId, plan) {
  return withLock_(function () {
    var sh = getSheet_('PlanSemanal', ['weekId', 'dia', 'comidaId', 'cenaId']);
    var data = sh.getDataRange().getValues();
    var rowIndexByDia = {};
    for (var i = 1; i < data.length; i++) {
      if (normalizeWeekId_(data[i][0]) === String(weekId)) {
        rowIndexByDia[data[i][1]] = i + 1;
      }
    }
    var newRows = [];
    DIAS.forEach(function (dia) {
      var entry = (plan && plan[dia]) || {};
      var comidaId = entry.comida || '';
      var cenaId = entry.cena || '';
      var rowIndex = rowIndexByDia[dia];
      if (rowIndex) {
        sh.getRange(rowIndex, 3, 1, 2).setValues([[comidaId, cenaId]]);
      } else {
        newRows.push([weekId, dia, comidaId, cenaId]);
      }
    });
    if (newRows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
    }
    cacheRemove_('weekplan_' + weekId);
    return true;
  });
}

// ---------- LISTA: PRODUCTOS SUELTOS ----------
// Hoja "ListaExtra": weekId | id | nombre | cantidad | unidad | categoria

function getShoppingExtras(weekId) {
  var key = 'extras_' + weekId;
  var cached = cacheGet_(key);
  if (cached) return cached;
  var sh = getSheet_('ListaExtra', ['weekId', 'id', 'nombre', 'cantidad', 'unidad', 'categoria']);
  var result = sheetToObjects_(sh, function (r) { return normalizeWeekId_(r[0]) === String(weekId); })
    .map(function (o) { return { id: String(o.id), name: o.nombre, qty: o.cantidad, unit: o.unidad, cat: o.categoria }; });
  cachePut_(key, result);
  return result;
}

function addShoppingExtra(weekId, item) {
  return withLock_(function () {
    var sh = getSheet_('ListaExtra', ['weekId', 'id', 'nombre', 'cantidad', 'unidad', 'categoria']);
    sh.appendRow([weekId, item.id, item.name, item.qty || '', item.unit || '', item.cat || 'Otros']);
    cacheRemove_('extras_' + weekId);
    return true;
  });
}

function deleteShoppingExtra(weekId, extraId) {
  return withLock_(function () {
    var sh = getSheet_('ListaExtra', ['weekId', 'id', 'nombre', 'cantidad', 'unidad', 'categoria']);
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (normalizeWeekId_(data[i][0]) === String(weekId) && String(data[i][1]) === String(extraId)) sh.deleteRow(i + 1);
    }
    cacheRemove_('extras_' + weekId);
    return true;
  });
}

// ---------- LISTA: MARCADOS ----------
// Hoja "ListaMarcados": weekId | itemKey | marcado

function getShoppingChecked(weekId) {
  var key = 'checked_' + weekId;
  var cached = cacheGet_(key);
  if (cached) return cached;
  var sh = getSheet_('ListaMarcados', ['weekId', 'itemKey', 'marcado']);
  var rows = sheetToObjects_(sh, function (r) { return normalizeWeekId_(r[0]) === String(weekId); });
  var map = {};
  rows.forEach(function (r) { map[r.itemKey] = (r.marcado === true || r.marcado === 'TRUE' || r.marcado === 'true'); });
  cachePut_(key, map);
  return map;
}

function setShoppingChecked(weekId, itemKey, value) {
  return withLock_(function () {
    var sh = getSheet_('ListaMarcados', ['weekId', 'itemKey', 'marcado']);
    var data = sh.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (normalizeWeekId_(data[i][0]) === String(weekId) && data[i][1] === itemKey) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) {
      sh.appendRow([weekId, itemKey, value]);
    } else {
      sh.getRange(rowIndex, 3).setValue(value);
    }
    cacheRemove_('checked_' + weekId);
    return true;
  });
}

function clearShoppingChecked(weekId) {
  return withLock_(function () {
    var sh = getSheet_('ListaMarcados', ['weekId', 'itemKey', 'marcado']);
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (normalizeWeekId_(data[i][0]) === String(weekId)) sh.deleteRow(i + 1);
    }
    cacheRemove_('checked_' + weekId);
    return true;
  });
}
