/**
 * Registro de Peso — backend (Google Apps Script)
 * API JSON sobre la Google Sheet que actúa como base de datos. El frontend
 * (GitHub Pages, estático) le pega a esto por fetch(); este script no sirve HTML.
 */

var SPREADSHEET_ID = '1ZYoBPSLDR3CuYrv_6bkFDoMCLxjlAIkqIYYCn8sP4JI';

// La lista de perfiles vive en la pestaña _Perfiles de la propia Sheet (no
// hardcodeada acá), para poder crear/editar/borrar perfiles desde la app sin
// redesplegar. Si esa pestaña no existe todavía (primera vez que corre esta
// versión), se crea sola y se llena con los perfiles que ya estaban en uso.
var CONFIG_SHEET_NAME = '_Perfiles';
var CONFIG_COLUMNS = ['key', 'sheetName', 'name', 'dataType', 'category', 'icon', 'weighMethod'];

// dataType controla qué columnas tiene la hoja de un perfil: 'full' = peso +
// %grasa + masa magra + edad metabólica + grasa visceral, con fila de
// objetivo (Iván/Isa). 'simple' = solo Fecha y Peso, sin objetivo (bebés y
// mascotas). weighMethod 'holding' hace que el formulario pida "tu peso
// solo" y "tu peso con la mascota en brazos" y calcule la resta.
var DEFAULT_PROFILES = [
  { key: 'ivan', sheetName: 'Iván ', name: 'Iván', dataType: 'full', category: 'Persona', icon: '🧔' },
  { key: 'isa', sheetName: 'Isa', name: 'Isa', dataType: 'full', category: 'Persona', icon: '👩' },
  { key: 'ilian', sheetName: 'Ilian', name: 'Ilian', dataType: 'simple', category: 'Bebé', icon: '👶' },
  { key: 'idris', sheetName: 'Idris', name: 'Idris', dataType: 'simple', category: 'Bebé', icon: '👶' },
  { key: 'yami', sheetName: 'Yami', name: 'Yami', dataType: 'simple', category: 'Mascota', icon: '🐱', weighMethod: 'holding' },
  { key: 'yoshi', sheetName: 'Yoshi', name: 'Yoshi', dataType: 'simple', category: 'Mascota', icon: '🐱', weighMethod: 'holding' },
  { key: 'spike', sheetName: 'Spike', name: 'Spike', dataType: 'simple', category: 'Mascota', icon: '🐱', weighMethod: 'holding' }
];

function doGet(e) {
  return handleRequest_(e.parameter.action, e.parameter);
}

// El body va como text/plain (no application/json) a propósito: eso mantiene
// el POST como "simple request" y evita el preflight OPTIONS, que Apps
// Script no puede responder con los headers CORS que un fetch cross-origin necesita.
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* body inválido: sigue vacío */ }
  return handleRequest_(body.action, body);
}

function handleRequest_(action, params) {
  var result;
  try {
    if (action === 'profiles') result = getProfiles();
    else if (action === 'data') result = getProfileData(params.profile);
    else if (action === 'addRecord') result = addRecord(params.profileKey, params.data);
    else if (action === 'createProfile') result = createProfile(params);
    else if (action === 'updateProfile') result = updateProfile(params);
    else if (action === 'deleteProfile') result = deleteProfile(params);
    else throw new Error('Acción desconocida: ' + action);
    return jsonOutput_({ ok: true, result: result });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------- configuración

function getConfigSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.appendRow(CONFIG_COLUMNS);
    DEFAULT_PROFILES.forEach(function (p) {
      sheet.appendRow([p.key, p.sheetName, p.name, p.dataType, p.category, p.icon, p.weighMethod || '']);
    });
  }
  return sheet;
}

function readProfiles_() {
  var sheet = getConfigSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, CONFIG_COLUMNS.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        key: r[0], sheetName: r[1], name: r[2], dataType: r[3],
        category: r[4], icon: r[5], weighMethod: r[6] || null
      };
    });
}

function findConfigRowIndex_(configSheet, key) {
  var lastRow = configSheet.getLastRow();
  var keys = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) return i + 2;
  }
  throw new Error('Perfil no encontrado en la configuración: ' + key);
}

function slugify_(name) {
  var base = String(name).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return base || ('perfil' + new Date().getTime());
}

function getProfiles() {
  return readProfiles_().map(function (p) {
    return { key: p.key, name: p.name, dataType: p.dataType, category: p.category, icon: p.icon, weighMethod: p.weighMethod || null };
  });
}

function findProfile_(profileKey) {
  var profiles = readProfiles_();
  var profile = null;
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].key === profileKey) profile = profiles[i];
  }
  if (!profile) throw new Error('Perfil no encontrado: ' + profileKey);
  return profile;
}

function getSheet_(profileKey) {
  var profile = findProfile_(profileKey);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(profile.sheetName);
  if (!sheet) throw new Error('Hoja no encontrada: ' + profile.sheetName);
  return { profile: profile, sheet: sheet };
}

function orBlank_(v) { return v === null || v === undefined ? '' : v; }

/** Fila de objetivo (fila 1) para un perfil 'full', a partir de porcentajes en humano (24.5, no 0.245). */
function objetivoRow_(objetivo) {
  objetivo = objetivo || {};
  var grasa = parseNumber_(objetivo.grasa);
  return [
    'Objetivo',
    orBlank_(parseNumber_(objetivo.peso)),
    orBlank_(grasa !== null ? grasa / 100 : null),
    orBlank_(parseNumber_(objetivo.masaMagra)),
    orBlank_(parseNumber_(objetivo.edad)),
    orBlank_(parseNumber_(objetivo.grasaVisceral))
  ];
}

/** Crea un perfil nuevo: agrega su hoja en la Sheet y su fila en _Perfiles. */
function createProfile(data) {
  if (!data || !data.name || !String(data.name).trim()) throw new Error('Falta el nombre del perfil');
  var name = String(data.name).trim();
  var dataType = data.dataType === 'full' ? 'full' : 'simple';
  var category = (data.category && String(data.category).trim()) || (dataType === 'full' ? 'Persona' : 'Otro');
  var icon = (data.icon && String(data.icon).trim()) || '👤';
  var weighMethod = dataType === 'simple' && data.weighMethod === 'holding' ? 'holding' : null;
  var key = slugify_(name);

  var profiles = readProfiles_();
  if (profiles.some(function (p) { return p.key === key; })) {
    throw new Error('Ya hay un perfil con un nombre muy parecido a "' + name + '"');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (ss.getSheetByName(name)) throw new Error('Ya existe una hoja llamada "' + name + '" en la planilla');

  var sheet = ss.insertSheet(name);
  if (dataType === 'full') {
    sheet.appendRow(objetivoRow_(data.objetivo));
    sheet.appendRow(['Dia', 'Peso', '%grasa corporal ', 'Masa magra', 'Edad', 'Grasa visceral (kg)']);
  }

  getConfigSheet_().appendRow([key, name, name, dataType, category, icon, weighMethod || '']);
  return getProfiles();
}

/** Edita nombre/categoría/ícono/objetivo de un perfil existente. No permite cambiar dataType. */
function updateProfile(data) {
  if (!data || !data.key) throw new Error('Falta indicar qué perfil editar');
  var profile = findProfile_(data.key);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(profile.sheetName);
  if (!sheet) throw new Error('Hoja no encontrada: ' + profile.sheetName);

  var newName = data.name && String(data.name).trim() ? String(data.name).trim() : profile.name;
  if (newName !== profile.sheetName) {
    if (ss.getSheetByName(newName)) throw new Error('Ya existe una hoja llamada "' + newName + '"');
    sheet.setName(newName);
  }

  var newCategory = data.category !== undefined && data.category !== '' ? String(data.category).trim() : profile.category;
  var newIcon = data.icon !== undefined && data.icon !== '' ? String(data.icon).trim() : profile.icon;
  var newWeighMethod = profile.dataType === 'simple' && data.weighMethod === 'holding' ? 'holding' : null;

  if (profile.dataType === 'full' && data.objetivo) {
    var row = objetivoRow_(data.objetivo);
    sheet.getRange(1, 1, 1, row.length).setValues([row]);
  }

  var configSheet = getConfigSheet_();
  var rowIndex = findConfigRowIndex_(configSheet, profile.key);
  configSheet.getRange(rowIndex, 2, 1, 6).setValues([[newName, newName, profile.dataType, newCategory, newIcon, newWeighMethod || '']]);

  return getProfiles();
}

/** Saca el perfil de la lista. No borra la hoja ni sus datos históricos. */
function deleteProfile(data) {
  if (!data || !data.key) throw new Error('Falta indicar qué perfil borrar');
  var configSheet = getConfigSheet_();
  var rowIndex = findConfigRowIndex_(configSheet, data.key);
  configSheet.deleteRow(rowIndex);
  return getProfiles();
}

// ------------------------------------------------------------ lectura

function parseNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  var cleaned = String(value).replace(/kg/i, '').trim().replace(',', '.');
  var n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Lee y normaliza los registros + objetivo de un perfil. */
function getProfileData(profileKey) {
  var found = getSheet_(profileKey);
  var profile = found.profile;
  var sheet = found.sheet;
  var lastRow = sheet.getLastRow();
  var records = [];
  var objetivo = null;

  if (profile.dataType === 'full') {
    var objetivoRow = sheet.getRange(1, 2, 1, 5).getValues()[0];
    objetivo = {
      peso: parseNumber_(objetivoRow[0]),
      grasa: parseNumber_(objetivoRow[1]),
      masaMagra: parseNumber_(objetivoRow[2]),
      edad: parseNumber_(objetivoRow[3]),
      grasaVisceral: parseNumber_(objetivoRow[4])
    };
    var numDataRows = Math.max(0, lastRow - 2);
    var raw = numDataRows > 0 ? sheet.getRange(3, 1, numDataRows, 6).getValues() : [];
    records = raw
      .filter(function (r) { return r[0] instanceof Date; })
      .map(function (r) {
        return {
          date: formatDate_(r[0]),
          peso: parseNumber_(r[1]),
          grasa: parseNumber_(r[2]),
          masaMagra: parseNumber_(r[3]),
          edad: parseNumber_(r[4]),
          grasaVisceral: parseNumber_(r[5])
        };
      });
  } else {
    var numRows = Math.max(0, lastRow);
    var rawPet = numRows > 0 ? sheet.getRange(1, 1, numRows, 2).getValues() : [];
    records = rawPet
      .filter(function (r) { return r[0] instanceof Date; })
      .map(function (r) {
        return { date: formatDate_(r[0]), peso: parseNumber_(r[1]) };
      });
  }

  records.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  var metricKeys = profile.dataType === 'full'
    ? ['peso', 'grasa', 'masaMagra', 'edad', 'grasaVisceral']
    : ['peso'];

  var stats = {};
  metricKeys.forEach(function (key) {
    stats[key] = computeMetricStats_(records, key, objetivo ? objetivo[key] : null);
  });

  return {
    profile: profile,
    objetivo: objetivo,
    records: records,
    stats: stats
  };
}

function computeMetricStats_(records, key, goal) {
  var vals = records.filter(function (r) { return r[key] !== null && r[key] !== undefined; });
  if (!vals.length) return null;

  var current = vals[vals.length - 1][key];
  var start = vals[0][key];
  var currentDate = new Date(vals[vals.length - 1].date + 'T00:00:00');

  var findAsOf = function (daysAgo) {
    var target = new Date(currentDate);
    target.setDate(target.getDate() - daysAgo);
    var candidate = null;
    for (var i = 0; i < vals.length; i++) {
      if (new Date(vals[i].date + 'T00:00:00') <= target) candidate = vals[i];
    }
    return candidate ? candidate[key] : null;
  };

  var v7 = findAsOf(7);
  var v30 = findAsOf(30);
  var min = Math.min.apply(null, vals.map(function (r) { return r[key]; }));
  var max = Math.max.apply(null, vals.map(function (r) { return r[key]; }));
  var sparkline = vals.slice(-12).map(function (r) { return r[key]; });

  var progress = null;
  var goodDirection = null;
  if (goal !== null && goal !== undefined) {
    if (goal === start) {
      progress = current === goal ? 100 : 0;
    } else {
      progress = ((current - start) / (goal - start)) * 100;
      progress = Math.max(0, Math.min(100, progress));
    }
    goodDirection = goal < start ? 'down' : goal > start ? 'up' : null;
  }

  return {
    current: current,
    start: start,
    min: min,
    max: max,
    delta7: v7 !== null ? current - v7 : null,
    delta30: v30 !== null ? current - v30 : null,
    goal: goal !== undefined ? goal : null,
    progress: progress,
    goodDirection: goodDirection,
    sparkline: sparkline
  };
}

/** Agrega un nuevo registro para el perfil indicado y devuelve los datos actualizados. */
function addRecord(profileKey, data) {
  var found = getSheet_(profileKey);
  var profile = found.profile;
  var sheet = found.sheet;

  if (!data || !data.date) throw new Error('Falta la fecha');
  var date = new Date(data.date + 'T00:00:00');
  if (isNaN(date.getTime())) throw new Error('Fecha inválida');

  var peso = parseNumber_(data.peso);
  if (peso === null) throw new Error('El peso es obligatorio y debe ser un número');

  if (profile.dataType === 'full') {
    var grasaPct = parseNumber_(data.grasa);
    var row = [
      date,
      peso,
      grasaPct !== null ? grasaPct / 100 : '',
      parseNumber_(data.masaMagra),
      parseNumber_(data.edad),
      parseNumber_(data.grasaVisceral)
    ].map(function (v) { return v === null ? '' : v; });
    sheet.appendRow(row);
  } else {
    sheet.appendRow([date, peso]);
  }

  return getProfileData(profileKey);
}
