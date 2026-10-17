// =====================================================================
// Sección Economía (antes: repositorio economia)
// ---------------------------------------------------------------------
// Movimientos, gastos fijos, presupuestos, objetivos, ajustes y reglas en
// la misma Google Sheet de siempre, y los tickets en la misma carpeta de
// Drive. Propiedades del script:
//   ECONOMIA_SPREADSHEET_ID = ID de la hoja de economía
//   ECONOMIA_FOLDER_ID      = ID de la carpeta de tickets (FOLDER_ID en el script original)
// La función onEdit (marcar filas editadas a mano) sigue en el script
// original, que vive dentro de la hoja: no se puede mover aquí.
// Todo va dentro de una función para que sus utilidades no choquen con
// las de otras secciones.
// =====================================================================

const SECCION_ECONOMIA = (function () {
  let ss_ = null;
  function getSS_() {
    if (ss_) return ss_;
    const id = PropertiesService.getScriptProperties().getProperty('ECONOMIA_SPREADSHEET_ID');
    if (!id) throw new Error('Falta la propiedad ECONOMIA_SPREADSHEET_ID en las propiedades del script Casa.');
    ss_ = SpreadsheetApp.openById(id);
    return ss_;
  }
  // Fechas en la zona horaria de la propia hoja, para que no cambien de día.
  function zona_() {
    return getSS_().getSpreadsheetTimeZone();
  }

  const MAX_CELL = 49000; // Sheets admite 50.000 caracteres por celda

  // Las mismas categorías que categories.js (si añades una allí, añádela aquí).
  // [nombre, grupo]
  const CATEGORIAS = {
    casa: ['Alquiler o hipoteca', 'fijo'],
    comunidad: ['Comunidad e IBI', 'fijo'],
    suministros: ['Luz, agua, gas e internet', 'fijo'],
    seguros: ['Seguros', 'fijo'],
    prestamos: ['Préstamos y tarjetas', 'fijo'],
    educacion: ['Colegio y guardería', 'fijo'],
    suscripciones: ['Suscripciones y cuotas', 'fijo'],
    impuestos: ['Impuestos y comisiones', 'fijo'],
    super: ['Alimentación y súper', 'variable'],
    transporte: ['Transporte y gasolina', 'variable'],
    salud: ['Salud y farmacia', 'variable'],
    hogar: ['Hogar y reparaciones', 'variable'],
    restaurantes: ['Bares y restaurantes', 'variable'],
    ocio: ['Ocio y viajes', 'variable'],
    ropa: ['Ropa y compras', 'variable'],
    regalos: ['Regalos y celebraciones', 'variable'],
    otros: ['Otros gastos', 'variable'],
    ahorro: ['Ahorro e inversión', 'ahorro'],
    nomina: ['Nómina', 'ingreso'],
    otros_ingresos: ['Otros ingresos', 'ingreso'],
  };
  // Nombres de la versión anterior, para leer bien las hojas antiguas.
  const NOMBRES_ANTIGUOS = {
    supermercado: 'super', vivienda: 'casa', 'transporte y coche': 'transporte', salud: 'salud',
    'educación e hijos': 'educacion', suscripciones: 'suscripciones',
  };
  const GRUPOS = { fijo: 'Gasto fijo', variable: 'Gasto variable', ahorro: 'Ahorro', ingreso: 'Ingreso' };
  const isIncome_ = (cat) => (CATEGORIAS[cat] || [])[1] === 'ingreso';

  // Quién: "comun" (los dos), "p1" o "p2". Los nombres están en la pestaña Ajustes.
  const LOS_DOS = 'Los dos';

  // [clave en la app, encabezado en la hoja, formato]
  const TABLES = {
    movs: {
      sheet: 'Movimientos',
      uuid: true,
      cols: [
        ['date', 'Fecha', 'date'],
        ['concept', 'Concepto'],
        ['category', 'Categoría', 'cat'],
        ['amount', 'Importe', 'money'],
        ['kind', 'Tipo', 'computed'],
        ['who', 'Quién', 'who'],
        ['note', 'Nota'],
        ['driveUrl', 'Ticket'],
        ['source', 'Origen'],
        ['addedBy', 'Añadido por', 'who'],
        ['modified', 'Modificado', 'readable'],
        ['id', 'ID'],
        ['fixedId', 'ID gasto fijo'],
        ['driveId', 'ID archivo'],
        ['mime', 'Tipo archivo'],
        ['createdAt', 'Creado', 'num'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
    budgets: {
      sheet: 'Presupuestos',
      cols: [
        ['id', 'Categoría', 'cat'],
        ['limit', 'Límite al mes', 'money'],
        ['modified', 'Modificado', 'readable'],
        ['updatedAt', 'Actualizado', 'num'],
      ],
    },
    fixed: {
      sheet: 'Gastos fijos',
      uuid: true,
      cols: [
        ['name', 'Recibo'],
        ['category', 'Categoría', 'cat'],
        ['amount', 'Importe', 'money'],
        ['day', 'Día de cobro', 'num'],
        ['every', 'Cada (meses)', 'num'],
        ['start', 'Primer mes (aaaa-mm)'],
        ['who', 'Quién', 'who'],
        ['match', 'Concepto en el banco'],
        ['modified', 'Modificado', 'readable'],
        ['id', 'ID'],
        ['createdAt', 'Creado', 'num'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
    goals: {
      sheet: 'Objetivos de ahorro',
      uuid: true,
      cols: [
        ['name', 'Objetivo'],
        ['target', 'Meta', 'money'],
        ['saved', 'Ahorrado', 'money'],
        ['deadline', 'Fecha límite', 'date'],
        ['modified', 'Modificado', 'readable'],
        ['id', 'ID'],
        ['createdAt', 'Creado', 'num'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
    settings: {
      sheet: 'Ajustes',
      cols: [
        ['id', 'Ajuste'],
        ['value', 'Valor'],
        ['modified', 'Modificado', 'readable'],
        ['updatedAt', 'Actualizado', 'num'],
      ],
    },
    rules: {
      sheet: 'Reglas',
      cols: [
        ['id', 'Concepto parecido a'],
        ['category', 'Categoría', 'cat'],
        ['modified', 'Modificado', 'readable'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
  };

  const FORMATS = { date: 'dd/mm/yyyy', money: '#,##0.00 €', num: '0' };

  // ---------- Sincronización ----------
  function sync_(req) {
    // Primero los ajustes, para tener los nombres de los dos al escribir la columna "Quién".
    const out = { settings: mergeTable_('settings', req.settings || []) };
    names_(out.settings);
    Object.keys(TABLES).forEach((key) => {
      if (key !== 'settings') out[key] = mergeTable_(key, req[key] || []);
    });
    return out;
  }

  // Nombres de las dos personas (pestaña Ajustes, filas p1 y p2).
  let NAMES_ = null;
  function names_(records) {
    if (!records) {
      if (NAMES_) return NAMES_;
      records = readRecords_(TABLES.settings, table_('settings'));
    }
    const get = (id, def) => String((records.find((r) => r.id === id) || {}).value || def).trim();
    NAMES_ = { p1: get('p1', 'Persona 1'), p2: get('p2', 'Persona 2') };
    return NAMES_;
  }

  // Une lo que llega con lo que hay en la hoja: gana la versión más reciente.
  function mergeTable_(key, incoming) {
    const sh = table_(key);
    const t = TABLES[key];
    const records = readRecords_(t, sh);
    const outdated = !headerOk_(t, sh); // hoja de una versión anterior: se reescribe entera
    const index = {};
    records.forEach((r, i) => (index[r.id] = i));
    let changed = outdated;

    incoming.forEach((rec) => {
      if (!rec || !rec.id) return;
      const i = index[rec.id];
      if (i === undefined) {
        if (rec.deleted) return;
        index[rec.id] = records.push(pick_(t, rec)) - 1;
        changed = true;
        return;
      }
      const cur = records[i];
      if (Number(rec.updatedAt) < Number(cur.updatedAt)) return;
      if (cur.driveId && (rec.deleted || rec.driveId !== cur.driveId)) trash_(cur.driveId);
      records[i] = rec.deleted
        ? Object.assign({}, cur, { deleted: true, updatedAt: Number(rec.updatedAt) })
        : pick_(t, rec);
      changed = true;
    });

    if (changed) {
      // Los movimientos más recientes, arriba.
      if (key === 'movs') records.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const rows = records.map((r) => t.cols.map((c) => toCell_(c, r)));
      const width = Math.max(sh.getLastColumn(), t.cols.length);
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
      if (outdated) setupColumns_(t, sh);
      if (rows.length) {
        t.cols.forEach((c, i) => sh.getRange(2, i + 1, rows.length, 1).setNumberFormat(FORMATS[c[2]] || '@'));
        sh.getRange(2, 1, rows.length, t.cols.length).setValues(rows);
      }
    }
    return records;
  }

  function table_(key) {
    const t = TABLES[key];
    const ss = getSS_();
    let sh = ss.getSheetByName(t.sheet);
    if (!sh) sh = ss.insertSheet(t.sheet);
    if (sh.getLastRow() === 0) setupColumns_(t, sh);
    return sh;
  }

  // Las columnas se buscan por su encabezado: así una hoja de una versión anterior (con otras
  // columnas o en otro orden) se lee bien y se reescribe con el formato nuevo.
  function readRecords_(t, sh) {
    if (sh.getLastRow() < 2) return [];
    const width = Math.max(sh.getLastColumn(), t.cols.length);
    const values = sh.getRange(1, 1, sh.getLastRow(), width).getValues();
    const head = values[0].map((h) => String(h).trim());
    const pos = t.cols.map((c) => head.indexOf(c[1]));
    const idCol = pos[t.cols.findIndex((c) => c[0] === 'id')];
    if (idCol < 0) return [];
    return values
      .slice(1)
      .filter((row) => row[idCol] !== '')
      .map((row) => {
        const rec = {};
        t.cols.forEach((c, i) => {
          const v = fromCell_(c, pos[i] >= 0 ? row[pos[i]] : '');
          if (v !== undefined) rec[c[0]] = v;
        });
        return rec;
      });
  }

  function headerOk_(t, sh) {
    const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), t.cols.length)).getValues()[0];
    return t.cols.every((c, i) => head[i] === c[1]) && head.slice(t.cols.length).every((h) => h === '');
  }

  // Encabezados, formatos de columna y desplegable de categorías.
  function setupColumns_(t, sh) {
    const width = Math.max(sh.getLastColumn(), t.cols.length);
    sh.getRange(1, 1, 1, width).clearContent();
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols.map((c) => c[1])]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const names = Object.keys(CATEGORIAS).map((k) => CATEGORIAS[k][0]);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true).build();
    t.cols.forEach((c, i) => {
      const range = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
      range.setNumberFormat(FORMATS[c[2]] || '@');
      range.setDataValidation(c[2] === 'cat' ? rule : null);
    });
  }

  // Normaliza lo que llega de la app para que sea igual que lo leído de la hoja.
  function pick_(t, rec) {
    const out = {};
    t.cols.forEach((c) => {
      if (c[2] === 'readable' || c[2] === 'computed') return;
      const v = rec[c[0]];
      // Los textos se devuelven tal cual, sin el apóstrofo que se añade al escribirlos en la hoja.
      out[c[0]] = c[2] ? fromCell_(c, toCell_(c, rec)) : v === undefined || v === null ? '' : String(v).slice(0, MAX_CELL);
    });
    return out;
  }

  function toCell_(c, rec) {
    const v = rec[c[0]];
    switch (c[2]) {
      case 'num': return Number(v) || 0;
      case 'money': return Math.round((Number(v) || 0) * 100) / 100;
      case 'bool': return v ? 'Sí' : '';
      case 'cat': return (CATEGORIAS[v] || CATEGORIAS.otros)[0];
      case 'who':
        if (v === 'p1' || v === 'p2') return names_()[v];
        return c[0] === 'addedBy' && !v ? '' : LOS_DOS;
      case 'date': {
        const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3], zona_(), 'yyyy-MM-dd') : '';
      }
      case 'readable':
        return Utilities.formatDate(new Date(Number(rec.updatedAt) || 0), zona_(), 'yyyy-MM-dd HH:mm');
      case 'computed': return GRUPOS[(CATEGORIAS[rec.category] || CATEGORIAS.otros)[1]];
      default: {
        const s = v === undefined || v === null ? '' : String(v).slice(0, MAX_CELL);
        // El apóstrofo evita que Sheets tome "= + - @" iniciales por una fórmula (no se ve ni se lee).
        return /^[=+\-@]/.test(s) ? "'" + s : s;
      }
    }
  }

  function fromCell_(c, v) {
    switch (c[2]) {
      case 'readable':
      case 'computed': return undefined;
      case 'num': return Number(v) || 0;
      case 'money': return Math.round(toNumber_(v) * 100) / 100;
      case 'bool': return v === true || v === 'Sí' || v === 'TRUE';
      case 'cat': return catId_(v);
      case 'who': return whoId_(v, c[0] === 'addedBy' ? '' : 'comun');
      case 'date': return v === '' && c[0] === 'deadline' ? '' : toIsoDate_(v);
      default: return v instanceof Date ? Utilities.formatDate(v, zona_(), 'yyyy-MM-dd') : String(v);
    }
  }

  // "Supermercado", "supermercado" o "super" -> "super". Lo que no se reconoce va a "Otros gastos".
  function catId_(v) {
    const s = String(v || '').trim().toLowerCase();
    if (CATEGORIAS[s]) return s;
    const k = Object.keys(CATEGORIAS).find((id) => CATEGORIAS[id][0].toLowerCase() === s);
    return k || NOMBRES_ANTIGUOS[s] || 'otros';
  }

  // "Ana" o "p1" -> "p1"; "Los dos" o un nombre desconocido -> "comun"; vacío -> def.
  function whoId_(v, def) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'p1' || s === 'p2' || s === 'comun') return s;
    if (!s) return def;
    const n = names_();
    if (s === n.p1.toLowerCase()) return 'p1';
    if (s === n.p2.toLowerCase()) return 'p2';
    return 'comun';
  }

  // Acepta números de la hoja y textos como "1.234,56 €" o "-12,30".
  function toNumber_(v) {
    if (typeof v === 'number') return v;
    let s = String(v || '').replace(/\s|€/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s) || 0;
  }

  function toIsoDate_(v) {
    const tz = zona_();
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }

  // ---------- Archivos en Drive ----------
  // A diferencia del script original, aquí no se crea la carpeta: si falta su ID, error.
  function folder_() {
    const id = (PropertiesService.getScriptProperties().getProperty('ECONOMIA_FOLDER_ID') || '').trim();
    if (!id) throw new Error('Falta la propiedad ECONOMIA_FOLDER_ID en las propiedades del script Casa.');
    return DriveApp.getFolderById(id);
  }

  function upload_(req) {
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || 'application/octet-stream', req.name || 'ticket');
    const file = folder_().createFile(blob);
    return { id: file.getId(), url: file.getUrl() };
  }

  function file_(req) {
    const file = DriveApp.getFileById(req.id);
    if (!inFolder_(file)) throw new Error('El archivo no está en la carpeta de tickets');
    const blob = file.getBlob();
    return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  }

  function trash_(id) {
    try {
      const file = DriveApp.getFileById(id);
      if (inFolder_(file)) file.setTrashed(true);
    } catch (err) {
      // ya no existe: nada que hacer
    }
  }

  function inFolder_(file) {
    const folderId = folder_().getId();
    const parents = file.getParents();
    while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
    return false;
  }


  // ---------- acciones ----------
  // Cada petición empieza sin hoja ni nombres en memoria.
  function inicio_() { ss_ = null; NAMES_ = null; }

  return {
    acciones: {
      ping: { tipo: 'ver', fn: function () { return {}; } },
      // Sincronizar envía cambios y recibe los de la hoja. Con permiso de solo ver,
      // se ignora lo que llega y solo se devuelve lo que hay.
      sync: {
        tipo: 'ver',
        fn: function (p, usuario) {
          inicio_();
          const req = permisosDe_(usuario).economia === 'editar' ? p : {};
          return withLock_(function () { return sync_(req); });
        },
      },
      upload: { tipo: 'editar', fn: function (p) { inicio_(); return upload_(p); } },
      file: { tipo: 'ver', fn: function (p) { inicio_(); return file_(p); } },
    },
  };
})();
