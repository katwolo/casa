// =====================================================================
// Sección Notes (antes: repositorio diario)
// ---------------------------------------------------------------------
// Notas, tareas, eventos y libretas en la misma Google Sheet de siempre
// (pestañas Notas y Libretas), y las fotos y grabaciones en la misma
// carpeta de Drive. Propiedades del script:
//   NOTES_SPREADSHEET_ID = ID de la hoja de Notes
//   NOTES_FOLDER_ID      = ID de la carpeta de fotos y grabaciones
// La función onEdit (marcar filas editadas a mano) sigue en el script
// original, que vive dentro de la hoja: no se puede mover aquí.
// Todo va dentro de una función para que sus utilidades no choquen con
// las de otras secciones.
// =====================================================================

const SECCION_NOTES = (function () {
  let ss_ = null;
  function getSS_() {
    if (ss_) return ss_;
    const id = PropertiesService.getScriptProperties().getProperty('NOTES_SPREADSHEET_ID');
    if (!id) throw new Error('Falta la propiedad NOTES_SPREADSHEET_ID en las propiedades del script Casa.');
    ss_ = SpreadsheetApp.openById(id);
    return ss_;
  }
  function zona_() {
    return getSS_().getSpreadsheetTimeZone();
  }
  function folderId_() {
    const id = (PropertiesService.getScriptProperties().getProperty('NOTES_FOLDER_ID') || '').trim();
    if (!id) throw new Error('Falta la propiedad NOTES_FOLDER_ID en las propiedades del script Casa.');
    return id;
  }

  const MAX_CELL = 49000; // Sheets admite 50.000 caracteres por celda

  const TIPOS = { note: 'Nota', task: 'Tarea', event: 'Evento', audio: 'Grabación', photo: 'Foto' };

  // [clave en la app, encabezado en la hoja, formato]
  const TABLES = {
    notebooks: {
      sheet: 'Libretas',
      cols: [
        ['id', 'ID'],
        ['name', 'Nombre'],
        ['modified', 'Modificado', 'readable'],
        ['createdAt', 'Creado', 'num'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
    items: {
      sheet: 'Notas',
      cols: [
        ['id', 'ID'],
        ['type', 'Tipo', 'type'],
        ['title', 'Título'],
        ['body', 'Contenido'],
        ['notebookName', 'Libreta', 'computed'],
        ['done', 'Completada', 'bool'],
        ['due', 'Fecha límite'],
        ['when', 'Fecha evento'],
        ['place', 'Lugar'],
        ['driveUrl', 'Archivo'],
        ['modified', 'Modificado', 'readable'],
        ['notebookId', 'ID libreta'],
        ['driveId', 'ID archivo'],
        ['mime', 'Tipo archivo'],
        ['createdAt', 'Creado', 'num'],
        ['updatedAt', 'Actualizado', 'num'],
        ['deleted', 'Borrado', 'bool'],
      ],
    },
  };

  // ---------- Sincronización ----------
  function sync_(req) {
    const nb = mergeTable_('notebooks', req.notebooks || []);
    const nbNames = {};
    nb.records.forEach((r) => { if (!r.deleted) nbNames[r.id] = r.name; });
    const it = mergeTable_('items', req.items || [], { nbNames: nbNames, force: nb.changed });
    return { notebooks: nb.records, items: it.records };
  }

  // Une lo que llega con lo que hay en la hoja: gana la versión más reciente.
  function mergeTable_(key, incoming, ctx) {
    ctx = ctx || {};
    const sh = table_(key);
    const t = TABLES[key];
    const records = readRecords_(t, sh);
    const index = {};
    records.forEach((r, i) => (index[r.id] = i));
    let changed = false;

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
      if (key === 'items' && cur.driveId && (rec.deleted || rec.driveId !== cur.driveId)) trash_(cur.driveId);
      records[i] = rec.deleted
        ? Object.assign({}, cur, { deleted: true, updatedAt: Number(rec.updatedAt) })
        : pick_(t, rec);
      changed = true;
    });

    if (changed || ctx.force) {
      const rows = records.map((r) => t.cols.map((c) => toCell_(c, r, ctx)));
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, t.cols.length).clearContent();
      if (rows.length) sh.getRange(2, 1, rows.length, t.cols.length).setNumberFormat('@').setValues(rows);
    }
    return { records: records, changed: changed };
  }

  function table_(key) {
    const t = TABLES[key];
    const ss = getSS_();
    let sh = ss.getSheetByName(t.sheet);
    if (!sh) sh = ss.insertSheet(t.sheet);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols.map((c) => c[1])]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  }

  function readRecords_(t, sh) {
    if (sh.getLastRow() < 2) return [];
    return sh
      .getRange(2, 1, sh.getLastRow() - 1, t.cols.length)
      .getValues()
      .filter((row) => row[0] !== '')
      .map((row) => {
        const rec = {};
        t.cols.forEach((c, i) => {
          const v = fromCell_(c, row[i]);
          if (v !== undefined) rec[c[0]] = v;
        });
        return rec;
      });
  }

  function pick_(t, rec) {
    const out = {};
    t.cols.forEach((c) => {
      if (c[2] !== 'readable' && c[2] !== 'computed') out[c[0]] = rec[c[0]];
    });
    return fromCellRecord_(t, out);
  }

  // Normaliza tipos para que lo devuelto sea igual que lo leído de la hoja.
  function fromCellRecord_(t, rec) {
    const out = {};
    t.cols.forEach((c) => {
      if (c[2] === 'readable' || c[2] === 'computed') return;
      const v = rec[c[0]];
      out[c[0]] = c[2] ? fromCell_(c, toCell_(c, rec, {})) : v === undefined || v === null ? '' : String(v).slice(0, MAX_CELL);
    });
    return out;
  }

  function toCell_(c, rec, ctx) {
    const v = rec[c[0]];
    switch (c[2]) {
      case 'num': return String(Number(v) || 0);
      case 'bool': return v ? 'Sí' : '';
      case 'type': return TIPOS[v] || TIPOS.note;
      case 'readable':
        return Utilities.formatDate(new Date(Number(rec.updatedAt) || 0), zona_(), 'yyyy-MM-dd HH:mm');
      case 'computed': return (ctx.nbNames && ctx.nbNames[rec.notebookId]) || '';
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
      case 'bool': return v === true || v === 'Sí' || v === 'TRUE';
      case 'type': {
        const k = Object.keys(TIPOS).find((key) => TIPOS[key] === v || key === v);
        return k || 'note';
      }
      default: return v instanceof Date ? Utilities.formatDate(v, zona_(), 'yyyy-MM-dd') : String(v);
    }
  }

  // ---------- Archivos en Drive ----------
  function upload_(req) {
    const folder = DriveApp.getFolderById(folderId_());
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || 'application/octet-stream', req.name || 'archivo');
    const file = folder.createFile(blob);
    return { id: file.getId(), url: file.getUrl() };
  }

  function file_(req) {
    const file = DriveApp.getFileById(req.id);
    if (!inFolder_(file)) throw new Error('El archivo no está en la carpeta de Diario');
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
    const parents = file.getParents();
    while (parents.hasNext()) if (parents.next().getId() === folderId_()) return true;
    return false;
  }


  // ---------- acciones ----------
  return {
    acciones: {
      ping: { tipo: 'ver', fn: function () { return {}; } },
      // Con permiso de solo ver, se ignora lo que llega y solo se devuelve lo que hay.
      sync: {
        tipo: 'ver',
        fn: function (p, usuario) {
          ss_ = null;
          const req = permisosDe_(usuario).notes === 'editar' ? p : {};
          return withLock_(function () { return sync_(req); });
        },
      },
      upload: { tipo: 'editar', fn: function (p) { ss_ = null; return upload_(p); } },
      file: { tipo: 'ver', fn: function (p) { ss_ = null; return file_(p); } },
    },
  };
})();
