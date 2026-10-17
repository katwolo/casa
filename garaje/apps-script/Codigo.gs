/**
 * Garatge · Seguiment de vehicles
 * Backend Google Apps Script — Sheets com a BD i Drive per a les factures.
 * Autor: Iván
 *
 * Estructura a Drive (es crea sola):
 *   Garatge · Vehicles/
 *     ├─ Garatge · Base de dades (full de càlcul)
 *     └─ 1234ABC · Golf/
 *          └─ 2026/
 *               └─ 2026-10-16_1234ABC_manteniment_canvi-d-oli.jpg
 */

const SH_VEH = 'Vehicles';
const SH_REG = 'Registres';
const COL_VEH = ['id', 'nom', 'matricula', 'marca', 'model', 'any', 'km', 'itv', 'asseguranca', 'color', 'carpeta', 'creat'];
const COL_REG = ['id', 'vehicle', 'data', 'tipus', 'titol', 'km', 'cost', 'taller', 'notes', 'fitxers', 'properaData', 'propersKm', 'creat'];

/* ───────────── Web app (API JSON per a la web de GitHub Pages) ───────────── */

/**
 * La interfície (index.html) està publicada a GitHub Pages i crida aquest script amb fetch().
 * Petició: POST amb cos JSON (Content-Type text/plain per evitar el preflight CORS):
 *   { "clau": "...", "fn": "getData", "args": [] }
 * Resposta: { "ok": true, "data": ... }  o  { "ok": false, "error": "..." }
 *
 * Clau d'accés: Configuració del projecte → Propietats de l'script → afegeix CLAU = <la teva clau>.
 * (Si no hi ha CLAU definida, l'API no exigeix clau — no recomanat.)
 */
const VERSIO = '2026-10-16 · OCR';
const API = { getData, saveVehicle, deleteVehicle, saveRecord, deleteRecord, getFitxer, llegirFactura };

function doGet() {
  return json_({ ok: true, app: 'Garatge', versio: VERSIO, funcions: Object.keys(API),
    missatge: 'API activa. Obre la web de GitHub Pages per fer servir l\'app.' });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const clau = PropertiesService.getScriptProperties().getProperty('CLAU');
    if (clau && req.clau !== clau) return json_({ ok: false, error: 'Clau d\'accés incorrecta', codi: 'CLAU' });
    const fn = API[req.fn];
    if (!fn) return json_({ ok: false, error: 'Funció desconeguda: ' + req.fn });
    return json_({ ok: true, data: fn.apply(null, Array.isArray(req.args) ? req.args : []) });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (/autoriz|permis|authoriz|permission/i.test(msg)) {
      return json_({ ok: false, error: 'Falten permisos: executa la funció autoritzar a l\'editor d\'Apps Script i torna a implementar. (' + msg + ')' });
    }
    return json_({ ok: false, error: msg });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────── Inicialització ───────────── */

/** Es pot executar manualment des de l'editor; també s'executa sol la primera vegada. */
function setupSheets() {
  const p = PropertiesService.getScriptProperties();

  let ss = null;
  const ssId = p.getProperty('SS_ID');
  if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Garatge · Base de dades');
    p.setProperty('SS_ID', ss.getId());
  }
  ensureSheet_(ss, SH_VEH, COL_VEH);
  ensureSheet_(ss, SH_REG, COL_REG);
  ss.getSheets().forEach(sh => {
    if (![SH_VEH, SH_REG].includes(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(sh);
  });

  let root = null;
  const rootId = p.getProperty('ROOT_ID');
  if (rootId) { try { root = DriveApp.getFolderById(rootId); if (root.isTrashed()) root = null; } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder('Garatge · Vehicles');
    p.setProperty('ROOT_ID', root.getId());
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }
  return { ss: ss.getUrl(), carpeta: root.getUrl() };
}

function ensureSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function ss_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SS_ID') || !p.getProperty('ROOT_ID')) setupSheets();
  try { return SpreadsheetApp.openById(p.getProperty('SS_ID')); }
  catch (e) { setupSheets(); return SpreadsheetApp.openById(p.getProperty('SS_ID')); }
}

function root_() {
  ss_();
  const p = PropertiesService.getScriptProperties();
  try {
    const f = DriveApp.getFolderById(p.getProperty('ROOT_ID'));
    if (!f.isTrashed()) return f;
  } catch (e) { /* es recrea */ }
  p.deleteProperty('ROOT_ID');
  setupSheets();
  return DriveApp.getFolderById(p.getProperty('ROOT_ID'));
}

/* ───────────── Helpers de full ───────────── */

function rows_(name, cols) {
  const sh = ss_().getSheetByName(name);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, n, cols.length).getValues()
    .filter(r => r[0] !== '')
    .map(r => {
      const o = {};
      cols.forEach((c, j) => { o[c] = r[j] instanceof Date ? Utilities.formatDate(r[j], tz, 'yyyy-MM-dd') : r[j]; });
      return o;
    });
}

function findRow_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1 || !id) return 0;
  const i = sh.getRange(2, 1, n, 1).getValues().flat().indexOf(id);
  return i < 0 ? 0 : i + 2;
}

function upsert_(name, cols, obj) {
  const sh = ss_().getSheetByName(name);
  const vals = cols.map(c => {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' && /^[=+\-@]/.test(v) && c !== 'data') return "'" + v; // evita fórmules
    return v;
  });
  const row = findRow_(sh, obj.id);
  if (row) sh.getRange(row, 1, 1, cols.length).setValues([vals]);
  else sh.appendRow(vals);
}

function deleteRow_(name, id) {
  const sh = ss_().getSheetByName(name);
  const r = findRow_(sh, id);
  if (r) sh.deleteRow(r);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? '' : n;
}

function parseJSON_(s) {
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s || '[]'); } catch (e) { return []; }
}

function slug_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ───────────── Drive ───────────── */

function carpetaVehicle_(veh) {
  const nom = [veh.matricula, veh.nom].filter(Boolean).join(' · ') || 'Vehicle';
  let f = null;
  if (veh.carpeta) { try { f = DriveApp.getFolderById(veh.carpeta); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
  if (!f) f = root_().createFolder(nom);
  else if (f.getName() !== nom) f.setName(nom);
  return f;
}

function subcarpeta_(pare, nom) {
  const it = pare.getFoldersByName(nom);
  return it.hasNext() ? it.next() : pare.createFolder(nom);
}

function puja_(carpeta, veh, reg, f, i) {
  const ext = f.mime === 'application/pdf' ? 'pdf' : 'jpg';
  const nom = [reg.data, veh.matricula, slug_(reg.tipus), slug_(reg.titol).slice(0, 40)]
    .filter(Boolean).join('_') + (i ? '_' + (i + 1) : '') + '.' + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.mime, nom);
  const file = carpeta.createFile(blob);
  file.setDescription([veh.matricula, reg.tipus, reg.titol,
    reg.km ? reg.km + ' km' : '', reg.cost !== '' ? reg.cost + ' €' : '', reg.taller].filter(Boolean).join(' · '));
  return { id: file.getId(), url: file.getUrl(), nom: nom, mime: f.mime };
}

function trash_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ja no hi és */ }
}

/** Retorna la imatge (o miniatura del PDF) com a dataURL per veure-la dins l'app. */
function getFitxer(id) {
  const f = DriveApp.getFileById(id);
  const b = f.getMimeType().indexOf('image/') === 0 ? f.getBlob() : f.getThumbnail();
  if (!b) return null;
  return 'data:' + (b.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(b.getBytes());
}

/* ───────────── OCR de factures (Drive) ───────────── */

/**
 * Passa fotos/PDF per l'OCR de Google Drive i en retorna el text.
 * Es crea un Document de Google temporal (conversió amb OCR), se n'exporta el text i s'esborra.
 * @param {Array} fitxers [{base64, mime}]
 * @return {string} text de tots els fitxers, un darrere l'altre
 */
function llegirFactura(fitxers) {
  const token = ScriptApp.getOAuthToken();
  const auth = { Authorization: 'Bearer ' + token };
  return (fitxers || []).slice(0, 4).map(f => {
    const bnd = 'garatge' + Utilities.getUuid();
    const meta = { name: 'garatge-ocr-temporal', mimeType: 'application/vnd.google-apps.document' };
    const cap = Utilities.newBlob('--' + bnd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + bnd + '\r\nContent-Type: ' + f.mime + '\r\n\r\n').getBytes();
    const peu = Utilities.newBlob('\r\n--' + bnd + '--').getBytes();
    const up = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=es&fields=id', {
      method: 'post', contentType: 'multipart/related; boundary=' + bnd, headers: auth,
      payload: cap.concat(Utilities.base64Decode(f.base64), peu), muteHttpExceptions: true
    });
    if (up.getResponseCode() >= 300) throw new Error('OCR: ' + up.getContentText().slice(0, 200));
    const id = JSON.parse(up.getContentText()).id;
    try {
      const ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/plain',
        { headers: auth, muteHttpExceptions: true });
      if (ex.getResponseCode() >= 300) throw new Error('OCR: ' + ex.getContentText().slice(0, 200));
      return ex.getContentText('UTF-8');
    } finally {
      UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'delete', headers: auth, muteHttpExceptions: true });
    }
  }).join('\n\n');
}

/** Executa-la una vegada des de l'editor per concedir els permisos nous (Drive + connexions externes). */
function autoritzar() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  return 'Permisos concedits';
}

/* ───────────── API ───────────── */

function getData() {
  const vehicles = rows_(SH_VEH, COL_VEH);
  const registres = rows_(SH_REG, COL_REG)
    .map(r => { r.fitxers = parseJSON_(r.fitxers); return r; })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.creat).localeCompare(String(a.creat)));
  const p = PropertiesService.getScriptProperties();
  return {
    vehicles: vehicles,
    registres: registres,
    links: {
      ss: 'https://docs.google.com/spreadsheets/d/' + p.getProperty('SS_ID'),
      carpeta: 'https://drive.google.com/drive/folders/' + p.getProperty('ROOT_ID')
    }
  };
}

function saveVehicle(v) {
  return withLock_(() => {
    const prev = v.id ? rows_(SH_VEH, COL_VEH).find(x => x.id === v.id) : null;
    const veh = Object.assign({}, prev || {}, v);
    if (!prev) { veh.id = Utilities.getUuid(); veh.creat = new Date(); }
    veh.matricula = String(veh.matricula || '').toUpperCase().replace(/[\s-]/g, '');
    veh.km = num_(veh.km);
    veh.any = num_(veh.any);
    veh.carpeta = carpetaVehicle_(veh).getId();
    upsert_(SH_VEH, COL_VEH, veh);
    return getData();
  });
}

/** Elimina el vehicle i els seus registres del full. Les factures es conserven a Drive. */
function deleteVehicle(id) {
  return withLock_(() => {
    rows_(SH_REG, COL_REG).filter(r => r.vehicle === id).forEach(r => deleteRow_(SH_REG, r.id));
    deleteRow_(SH_VEH, id);
    return getData();
  });
}

/**
 * @param {Object} r      registre (amb r.fitxers = fitxers ja existents que es mantenen)
 * @param {Array}  nous   [{base64, mime, nom}] fitxers nous a pujar
 */
function saveRecord(r, nous) {
  return withLock_(() => {
    const veh = rows_(SH_VEH, COL_VEH).find(v => v.id === r.vehicle);
    if (!veh) throw new Error('Vehicle no trobat');

    const prev = r.id ? rows_(SH_REG, COL_REG).find(x => x.id === r.id) : null;
    const reg = Object.assign({}, r);
    if (!prev) { reg.id = Utilities.getUuid(); reg.creat = new Date(); }
    else reg.creat = prev.creat;
    reg.km = num_(reg.km);
    reg.cost = num_(reg.cost);
    reg.propersKm = num_(reg.propersKm);

    // Fitxers: es mantenen els que envia el client; els eliminats van a la paperera
    const kept = Array.isArray(r.fitxers) ? r.fitxers : [];
    if (prev) parseJSON_(prev.fitxers).filter(f => !kept.some(k => k.id === f.id)).forEach(f => trash_(f.id));

    const cv = carpetaVehicle_(veh);
    let canviVeh = false;
    if (cv.getId() !== veh.carpeta) { veh.carpeta = cv.getId(); canviVeh = true; }

    let pujats = [];
    if (nous && nous.length) {
      const carpetaAny = subcarpeta_(cv, String(reg.data || '').slice(0, 4) || 'Sense data');
      pujats = nous.map((f, i) => puja_(carpetaAny, veh, reg, f, kept.length + i));
    }
    reg.fitxers = JSON.stringify(kept.concat(pujats));
    upsert_(SH_REG, COL_REG, reg);

    // Actualitza dades del vehicle
    if (reg.km && reg.km > (Number(veh.km) || 0)) { veh.km = reg.km; canviVeh = true; }
    if (reg.tipus === 'ITV' && reg.properaData && reg.properaData > String(veh.itv || '')) {
      veh.itv = reg.properaData; canviVeh = true;
    }
    if (reg.tipus === 'Assegurança' && reg.properaData && reg.properaData > String(veh.asseguranca || '')) {
      veh.asseguranca = reg.properaData; canviVeh = true;
    }
    if (canviVeh) upsert_(SH_VEH, COL_VEH, veh);

    return getData();
  });
}

function deleteRecord(id) {
  return withLock_(() => {
    const r = rows_(SH_REG, COL_REG).find(x => x.id === id);
    if (r) {
      parseJSON_(r.fitxers).forEach(f => trash_(f.id));
      deleteRow_(SH_REG, id);
    }
    return getData();
  });
}