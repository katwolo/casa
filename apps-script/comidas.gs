// =====================================================================
// Sección Comidas (antes: repositorio si_chef)
// ---------------------------------------------------------------------
// Recetas, planificación semanal y lista de la compra, en la misma
// Google Sheet de siempre. Propiedad del script necesaria:
//   COMIDAS_SPREADSHEET_ID = ID de la hoja de Comidas
// Todo va dentro de una función para que sus utilidades no choquen con
// las de otras secciones.
// =====================================================================

const SECCION_COMIDAS = (function () {
  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // ---------- utilidades de hoja ----------

  function getSS_() {
    var id = PropertiesService.getScriptProperties().getProperty('COMIDAS_SPREADSHEET_ID');
    if (!id) {
      throw new Error('Falta la propiedad COMIDAS_SPREADSHEET_ID en las propiedades del script Casa.');
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
  // Mientras la web original (si_chef) siga en uso, escribe en la misma hoja
  // desde otro script con su propia caché; por eso aquí la caché dura poco.
  var CACHE_TTL_ = 300;

  function cacheGet_(key) {
    var v = CacheService.getScriptCache().get('comidas_' + key);
    return v ? JSON.parse(v) : null;
  }

  function cachePut_(key, value) {
    try {
      CacheService.getScriptCache().put('comidas_' + key, JSON.stringify(value), CACHE_TTL_);
    } catch (e) {
      // p.ej. valor por encima del límite de tamaño de la caché (100 KB):
      // mejor servir sin caché que romper la petición entera.
    }
  }

  function cacheRemove_(key) {
    CacheService.getScriptCache().remove('comidas_' + key);
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

  // ---------- acciones ----------
  function ver(fn) { return { tipo: 'ver', fn: fn }; }
  function editar(fn) { return { tipo: 'editar', fn: fn }; }

  return {
    acciones: {
      getRecipes: ver(function () { return getRecipes(); }),
      refreshRecipesCache: ver(function () { return refreshRecipesCache(); }),
      getWeekPlan: ver(function (p) { return getWeekPlan(p.weekId); }),
      getShoppingExtras: ver(function (p) { return getShoppingExtras(p.weekId); }),
      getShoppingChecked: ver(function (p) { return getShoppingChecked(p.weekId); }),
      saveRecipe: editar(function (p) { return saveRecipe(p.recipe); }),
      deleteRecipeById: editar(function (p) { return deleteRecipeById(p.id); }),
      setWeekPlanCell: editar(function (p) { return setWeekPlanCell(p.weekId, p.dia, p.meal, p.recipeId); }),
      setWeekPlan: editar(function (p) { return setWeekPlan(p.weekId, p.plan); }),
      addShoppingExtra: editar(function (p) { return addShoppingExtra(p.weekId, p.item); }),
      deleteShoppingExtra: editar(function (p) { return deleteShoppingExtra(p.weekId, p.extraId); }),
      setShoppingChecked: editar(function (p) { return setShoppingChecked(p.weekId, p.itemKey, p.value); }),
      clearShoppingChecked: editar(function (p) { return clearShoppingChecked(p.weekId); }),
    },
  };
})();
