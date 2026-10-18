// =====================================================================
// Sección Garaje (antes: repositorio garatge)
// ---------------------------------------------------------------------
// Vehículos, registros y facturas: la misma Google Sheet y la misma
// carpeta de Drive de siempre. Propiedades del script:
//   GARAJE_SS_ID   = ID de la hoja «Garatge · Base de dades» (SS_ID en el script original)
//   GARAJE_ROOT_ID = ID de la carpeta «Garatge · Vehicles» (ROOT_ID en el script original)
// Necesita permisos de Drive y de conexiones externas (para el OCR).
// Todo va dentro de una función para que sus utilidades no choquen con
// las de otras secciones.
// =====================================================================

const SECCION_GARAJE = (function () {
  const SH_VEH = 'Vehicles';
  const SH_REG = 'Registres';
  const COL_VEH = ['id', 'nom', 'matricula', 'marca', 'model', 'any', 'km', 'itv', 'asseguranca', 'color', 'carpeta', 'creat'];
  const COL_REG = ['id', 'vehicle', 'data', 'tipus', 'titol', 'km', 'cost', 'taller', 'notes', 'fitxers', 'properaData', 'propersKm', 'creat'];

  /* ───────────── Full i carpeta (IDs a les propietats del script Casa) ───────────── */

  // A diferència de l'script original, aquí no es crea res automàticament: si falta
  // un ID, es mostra un error per no començar sense voler una base de dades buida.
  function ss_() {
    const id = PropertiesService.getScriptProperties().getProperty('GARAJE_SS_ID');
    if (!id) throw new Error('Falta la propiedad GARAJE_SS_ID en las propiedades del script Casa.');
    return SpreadsheetApp.openById(id);
  }

  function root_() {
    const id = PropertiesService.getScriptProperties().getProperty('GARAJE_ROOT_ID');
    if (!id) throw new Error('Falta la propiedad GARAJE_ROOT_ID en las propiedades del script Casa.');
    const f = DriveApp.getFolderById(id);
    if (f.isTrashed()) throw new Error('La carpeta de Garaje («Garatge · Vehicles») está en la papelera de Drive.');
    return f;
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

  /* ───────────── Lectura de factures: Gemini, i si falla, l'OCR de Drive ───────────── */

  const TIPUS_GARATGE = ['Manteniment', 'Reparació', 'ITV', 'Pneumàtics', 'Assegurança', 'Impostos', 'Recanvis', 'Altres'];

  /**
   * @param {Array} fitxers [{base64, mime}]
   * @return {{text: string, campos: Object|null, motor: string, avis?: string}}
   *   campos: dades que Gemini ha trobat (null si s'ha fet servir l'OCR de Drive i la web les ha d'extreure del text)
   */
  function llegirFactura(fitxers) {
    try {
      return llegirFacturaGemini_(fitxers);
    } catch (e) {
      // Si Gemini falla (sense clau, quota, xarxa…), es fa com abans.
      return { text: llegirFacturaDrive_(fitxers), campos: null, motor: 'drive', avis: e.message };
    }
  }

  function llegirFacturaGemini_(fitxers) {
    const prompt = [
      'Eres un asistente que lee facturas, tickets y documentos de vehículos (talleres, ITV, seguros, impuestos de circulación, recambios).',
      'Puede haber varias imágenes o un PDF del mismo documento. Transcribe TODO el texto visible.',
      reglasTranscripcion_(false),
      '',
      'Devuelve SOLO un objeto JSON con esta forma:',
      '{',
      '  "texto": "la transcripción completa, siguiendo las reglas",',
      '  "campos": {',
      '    "matricula": "matrícula del vehículo tal como aparece, o null",',
      '    "tipus": "uno de: ' + TIPUS_GARATGE.join(', ') + '",',
      '    "titol": "resumen breve en catalán de lo que se ha hecho (máximo 60 caracteres), por ejemplo \"Revisió i canvi de filtres\"",',
      '    "data": "fecha de la factura, AAAA-MM-DD",',
      '    "km": "kilómetros del vehículo (número entero) o null",',
      '    "cost": "importe total pagado con IVA (número con punto decimal) o null",',
      '    "taller": "nombre del taller o de la empresa que emite el documento, o null",',
      '    "notes": "conceptos principales de la factura, uno por línea (máximo 6), o null",',
      '    "properaData": "fecha de la próxima revisión, próxima ITV o vencimiento del seguro, AAAA-MM-DD, o null",',
      '    "propersKm": "kilómetros de la próxima revisión (número entero) o null"',
      '  }',
      '}',
      'Si un dato no aparece en el documento, pon null. No inventes datos.',
    ].join('\n');
    const r = geminiJson_(prompt, (fitxers || []).map(f => ({ mime: f.mime, data: f.base64 })));
    const c = r.campos || {};
    const enter = v => { const n = geminiNumero_(v); return n === null ? null : Math.round(n); };
    const campos = {
      matricula: geminiTextoCorto_(c.matricula, 20),
      tipus: TIPUS_GARATGE.indexOf(c.tipus) >= 0 ? c.tipus : null,
      titol: geminiTextoCorto_(c.titol, 80),
      data: geminiFecha_(c.data),
      km: enter(c.km),
      cost: geminiNumero_(c.cost),
      taller: geminiTextoCorto_(c.taller, 80),
      notes: geminiTextoCorto_(c.notes, 600),
      properaData: geminiFecha_(c.properaData),
      propersKm: enter(c.propersKm),
    };
    return { text: String(r.texto || ''), campos: campos, motor: 'gemini' };
  }

  /**
   * Passa fotos/PDF per l'OCR de Google Drive i en retorna el text.
   * Es crea un Document de Google temporal (conversió amb OCR), se n'exporta el text i s'esborra.
   */
  function llegirFacturaDrive_(fitxers) {
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
        ss: 'https://docs.google.com/spreadsheets/d/' + p.getProperty('GARAJE_SS_ID'),
        carpeta: 'https://drive.google.com/drive/folders/' + p.getProperty('GARAJE_ROOT_ID')
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
  // ---------- acciones ----------
  // La web envía los argumentos igual que antes: { args: [...] }.
  function accion(tipo, fn) {
    return { tipo: tipo, fn: function (p) { return fn.apply(null, Array.isArray(p.args) ? p.args : []); } };
  }

  return {
    acciones: {
      getData: accion('ver', getData),
      getFitxer: accion('ver', getFitxer),
      llegirFactura: accion('editar', llegirFactura),
      saveVehicle: accion('editar', saveVehicle),
      deleteVehicle: accion('editar', deleteVehicle),
      saveRecord: accion('editar', saveRecord),
      deleteRecord: accion('editar', deleteRecord),
    },
  };
})();
