/**
 * MediHome — Google Apps Script Backend
 *
 * Google Sheet estructurat en 3 pestanyes:
 *   · Medicaments   (15 columnes: A–O)
 *   · Tractaments   (12 columnes: A–L)
 *   · Dosis         (10 columnes: A–J)
 *
 * DEPLOYMENT:
 *   Deploy → New deployment
 *   Tipus:          Web App
 *   Execute as:     Me
 *   Who has access: Anyone   ← OBLIGATORI
 *   Usar la URL /exec al frontend (mai /dev en producció).
 *
 * CAPÇALERES DEL FULL (fila 1, s'ha de crear manualment o via initSheets()):
 *   Medicaments:  ID | Nom | PrincipioActivo | Quantitat | Unitat | StockMinim | Caducitat |
 *                 Ubicacio | Categoria | Mascota | Notes | SIGRE | DataSIGRE | DataCreacio | Estat
 *   Tractaments:  ID | Nom | MedicamentID | MedicamentNom | DosisQuantitat |
 *                 Frequencia | Instruccions | DataInici | DataFi | Actiu | DataCreacio | Estat
 *   Dosis:        ID | TractamentID | MedicamentID | MedicamentNom |
 *                 Quantitat | Data | Hora | Notes | DataCreacio | Estat
 */

// ── CONNEXIÓ AL FULL ─────────────────────────────────────────
// Si el script és autònom (no creat des de Extensions > Apps Script del full),
// posa aquí l'ID del Google Sheet (part de la URL: /spreadsheets/d/<ID>/edit).
// Si és un script lligat al full, deixa-ho buit.
const SPREADSHEET_ID = '';
function getSpreadsheet() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

// ── CONFIGURACIÓ PER ENTITAT ──────────────────────────────────
const CFG = {
  medicaments: {
    SHEET_NAME: 'Medicaments',
    COLS: {
      ID: 1, NOM: 2, LAB: 3, QUANTITAT: 4, UNITAT: 5, STOCK_MINIM: 6,
      CADUCITAT: 7, UBICACIO: 8, CATEGORIA: 9, MASCOTA: 10, NOTES: 11,
      SIGRE: 12, DATA_SIGRE: 13, DATA_CREACIO: 14, ESTAT: 15,
    },
    TOTAL_COLS: 15,
    HEADERS: ['ID','Nom','PrincipioActivo','Quantitat','Unitat','StockMinim','Caducitat',
              'Ubicacio','Categoria','Mascota','Notes','SIGRE','DataSIGRE','DataCreacio','Estat'],
  },
  tractaments: {
    SHEET_NAME: 'Tractaments',
    COLS: {
      ID: 1, NOM: 2, MEDICAMENT_ID: 3, MEDICAMENT_NOM: 4,
      DOSIS_QUANTITAT: 5, FREQUENCIA: 6, INSTRUCCIONS: 7,
      DATA_INICI: 8, DATA_FI: 9, ACTIU: 10, DATA_CREACIO: 11, ESTAT: 12,
    },
    TOTAL_COLS: 12,
    HEADERS: ['ID','Nom','MedicamentID','MedicamentNom','DosisQuantitat',
              'Frequencia','Instruccions','DataInici','DataFi','Actiu','DataCreacio','Estat'],
  },
  dosis: {
    SHEET_NAME: 'Dosis',
    COLS: {
      ID: 1, TRACTAMENT_ID: 2, MEDICAMENT_ID: 3, MEDICAMENT_NOM: 4,
      QUANTITAT: 5, DATA: 6, HORA: 7, NOTES: 8, DATA_CREACIO: 9, ESTAT: 10,
    },
    TOTAL_COLS: 10,
    HEADERS: ['ID','TractamentID','MedicamentID','MedicamentNom',
              'Quantitat','Data','Hora','Notes','DataCreacio','Estat'],
  },
};

// ── doGet ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    const entitat = ((e.parameter && e.parameter.entitat) || 'medicaments').toLowerCase();
    const filtre  = ((e.parameter && e.parameter.filtre)  || 'actiu').toLowerCase();
    const cfg     = CFG[entitat];
    if (!cfg) return jsonResponse({ ok: false, error: 'Entitat desconeguda: ' + entitat });

    const sheet = getSpreadsheet().getSheetByName(cfg.SHEET_NAME);
    if (!sheet) return jsonResponse({ ok: false, error: 'Full no trobat: ' + cfg.SHEET_NAME });

    const data = sheet.getDataRange().getValues();
    const registres = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (filtre !== 'tots') {
        if (String(r[cfg.COLS.ESTAT - 1]).toLowerCase() !== 'actiu') continue;
      }
      const obj = rowToObj(r, entitat, cfg);
      if (obj.id) registres.push(obj);
    }
    return jsonResponse({ ok: true, registres });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const entitat = (payload.entitat || '').toLowerCase();
    const accio   = (payload.accio   || '').toLowerCase();
    const cfg     = CFG[entitat];
    if (!cfg)   return jsonResponse({ ok: false, error: 'Entitat desconeguda: ' + entitat });
    if (!accio) return jsonResponse({ ok: false, error: 'Camp "accio" obligatori' });

    const sheet = getSpreadsheet().getSheetByName(cfg.SHEET_NAME);
    if (!sheet) return jsonResponse({ ok: false, error: 'Full no trobat: ' + cfg.SHEET_NAME });

    if (accio === 'crear')    return crear(sheet, payload, entitat, cfg);
    if (accio === 'editar')   return editar(sheet, payload, entitat, cfg);
    if (accio === 'eliminar') return eliminar(sheet, payload, entitat, cfg);
    return jsonResponse({ ok: false, error: 'Acció desconeguda: ' + accio });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── crear ─────────────────────────────────────────────────────
function crear(sheet, p, entitat, cfg) {
  const id  = p.id || Utilities.getUuid();
  const ara = new Date().toISOString().split('T')[0];
  const C   = cfg.COLS;
  const fila = new Array(cfg.TOTAL_COLS).fill('');

  if (entitat === 'medicaments') {
    fila[C.ID - 1]           = id;
    fila[C.NOM - 1]          = p.name          || '';
    fila[C.LAB - 1]          = p.lab           || '';
    fila[C.QUANTITAT - 1]    = p.quantity       !== undefined ? Number(p.quantity) : 0;
    fila[C.UNITAT - 1]       = p.unit           || 'unitats';
    fila[C.STOCK_MINIM - 1]  = p.minStock       !== undefined ? Number(p.minStock) : 0;
    fila[C.CADUCITAT - 1]    = p.expiryDate     || '';
    fila[C.UBICACIO - 1]     = p.location       || '';
    fila[C.CATEGORIA - 1]    = p.category       || '';
    fila[C.MASCOTA - 1]      = p.pet            || '';
    fila[C.NOTES - 1]        = p.notes          || '';
    fila[C.SIGRE - 1]        = p.forSIGRE       ? 'si' : 'no';
    fila[C.DATA_SIGRE - 1]   = p.sigreDate      || '';
    fila[C.DATA_CREACIO - 1] = p.createdAt      || ara;
    fila[C.ESTAT - 1]        = 'actiu';

  } else if (entitat === 'tractaments') {
    fila[C.ID - 1]              = id;
    fila[C.NOM - 1]             = p.name         || '';
    fila[C.MEDICAMENT_ID - 1]   = p.medicineId   || '';
    fila[C.MEDICAMENT_NOM - 1]  = p.medicineName || '';
    fila[C.DOSIS_QUANTITAT - 1] = p.doseQty      !== undefined ? Number(p.doseQty) : 1;
    fila[C.FREQUENCIA - 1]      = p.frequency    || 'once';
    fila[C.INSTRUCCIONS - 1]    = p.instructions || '';
    fila[C.DATA_INICI - 1]      = p.startDate    || ara;
    fila[C.DATA_FI - 1]         = p.endDate      || '';
    fila[C.ACTIU - 1]           = p.active !== false ? 'si' : 'no';
    fila[C.DATA_CREACIO - 1]    = p.createdAt    || ara;
    fila[C.ESTAT - 1]           = 'actiu';

  } else if (entitat === 'dosis') {
    fila[C.ID - 1]             = id;
    fila[C.TRACTAMENT_ID - 1]  = p.treatmentId  || '';
    fila[C.MEDICAMENT_ID - 1]  = p.medicineId   || '';
    fila[C.MEDICAMENT_NOM - 1] = p.medicineName || '';
    fila[C.QUANTITAT - 1]      = p.quantity      !== undefined ? Number(p.quantity) : 1;
    fila[C.DATA - 1]           = p.date          || ara;
    fila[C.HORA - 1]           = p.time          || '';
    fila[C.NOTES - 1]          = p.notes         || '';
    fila[C.DATA_CREACIO - 1]   = p.createdAt     || new Date().toISOString();
    fila[C.ESTAT - 1]          = 'actiu';

  } else {
    return jsonResponse({ ok: false, error: 'Entitat no suportada: ' + entitat });
  }

  sheet.appendRow(fila);
  return jsonResponse({ ok: true, registre: rowToObj(fila, entitat, cfg) });
}

// ── editar ────────────────────────────────────────────────────
function editar(sheet, p, entitat, cfg) {
  const trobat = trobaFila(sheet, p.id, cfg);
  if (!trobat) return jsonResponse({ ok: false, error: 'Registre no trobat' });
  const { row } = trobat;
  const C = cfg.COLS;

  if (entitat === 'medicaments') {
    if (p.name       !== undefined) sheet.getRange(row, C.NOM).setValue(p.name);
    if (p.lab        !== undefined) sheet.getRange(row, C.LAB).setValue(p.lab || '');
    if (p.quantity   !== undefined) sheet.getRange(row, C.QUANTITAT).setValue(Number(p.quantity));
    if (p.unit       !== undefined) sheet.getRange(row, C.UNITAT).setValue(p.unit);
    if (p.minStock   !== undefined) sheet.getRange(row, C.STOCK_MINIM).setValue(Number(p.minStock));
    if (p.expiryDate !== undefined) sheet.getRange(row, C.CADUCITAT).setValue(p.expiryDate || '');
    if (p.location   !== undefined) sheet.getRange(row, C.UBICACIO).setValue(p.location || '');
    if (p.category   !== undefined) sheet.getRange(row, C.CATEGORIA).setValue(p.category || '');
    if (p.pet        !== undefined) sheet.getRange(row, C.MASCOTA).setValue(p.pet || '');
    if (p.notes      !== undefined) sheet.getRange(row, C.NOTES).setValue(p.notes || '');
    if (p.forSIGRE   !== undefined) sheet.getRange(row, C.SIGRE).setValue(p.forSIGRE ? 'si' : 'no');
    if (p.sigreDate  !== undefined) sheet.getRange(row, C.DATA_SIGRE).setValue(p.sigreDate || '');

  } else if (entitat === 'tractaments') {
    if (p.name         !== undefined) sheet.getRange(row, C.NOM).setValue(p.name);
    if (p.medicineId   !== undefined) sheet.getRange(row, C.MEDICAMENT_ID).setValue(p.medicineId);
    if (p.medicineName !== undefined) sheet.getRange(row, C.MEDICAMENT_NOM).setValue(p.medicineName);
    if (p.doseQty      !== undefined) sheet.getRange(row, C.DOSIS_QUANTITAT).setValue(Number(p.doseQty));
    if (p.frequency    !== undefined) sheet.getRange(row, C.FREQUENCIA).setValue(p.frequency);
    if (p.instructions !== undefined) sheet.getRange(row, C.INSTRUCCIONS).setValue(p.instructions || '');
    if (p.startDate    !== undefined) sheet.getRange(row, C.DATA_INICI).setValue(p.startDate || '');
    if (p.endDate      !== undefined) sheet.getRange(row, C.DATA_FI).setValue(p.endDate || '');
    if (p.active       !== undefined) sheet.getRange(row, C.ACTIU).setValue(p.active ? 'si' : 'no');

  } else if (entitat === 'dosis') {
    if (p.quantity !== undefined) sheet.getRange(row, C.QUANTITAT).setValue(Number(p.quantity));
    if (p.date     !== undefined) sheet.getRange(row, C.DATA).setValue(p.date || '');
    if (p.time     !== undefined) sheet.getRange(row, C.HORA).setValue(p.time || '');
    if (p.notes    !== undefined) sheet.getRange(row, C.NOTES).setValue(p.notes || '');
  }

  return jsonResponse({ ok: true });
}

// ── eliminar ──────────────────────────────────────────────────
function eliminar(sheet, p, entitat, cfg) {
  const trobat = trobaFila(sheet, p.id, cfg);
  if (!trobat) return jsonResponse({ ok: false, error: 'Registre no trobat' });
  const { row } = trobat;
  if (cfg.COLS.ESTAT) {
    sheet.getRange(row, cfg.COLS.ESTAT).setValue('inactiu');
  } else {
    sheet.deleteRow(row);
  }
  return jsonResponse({ ok: true });
}

// ── trobaFila ─────────────────────────────────────────────────
function trobaFila(sheet, id, cfg) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cfg.COLS.ID - 1]) === String(id)) {
      return { row: i + 1, values: data[i] };
    }
  }
  return null;
}

// ── fmtTime ───────────────────────────────────────────────────
// Normalizes a Sheets time value (Date object or string) to HH:MM.
function fmtTime(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return String(v.getHours()).padStart(2,'0') + ':' + String(v.getMinutes()).padStart(2,'0');
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  const m = s.match(/(\d{2}:\d{2}):\d{2}/);
  return m ? m[1] : s;
}

// ── dateToYYYYMM ──────────────────────────────────────────────
// Normalizes any date value from Sheets to YYYY-MM string.
// Handles: Date objects, "DD/MM/YYYY", "YYYY-MM-DD", "YYYY-MM".
function dateToYYYYMM(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, '0');
    return `${y}-${mo}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return s;
}

// ── rowToObj ──────────────────────────────────────────────────
function rowToObj(r, entitat, cfg) {
  const C = (cfg || CFG[entitat]).COLS;

  if (entitat === 'medicaments') {
    return {
      id:         String(r[C.ID - 1]           || ''),
      name:       String(r[C.NOM - 1]          || ''),
      lab:        String(r[C.LAB - 1]          || ''),
      quantity:   parseFloat(r[C.QUANTITAT - 1])    || 0,
      unit:       String(r[C.UNITAT - 1]       || 'unitats'),
      minStock:   parseFloat(r[C.STOCK_MINIM - 1]) || 0,
      expiryDate: dateToYYYYMM(r[C.CADUCITAT - 1]) || null,
      location:   String(r[C.UBICACIO - 1]     || ''),
      category:   String(r[C.CATEGORIA - 1]    || ''),
      pet:        String(r[C.MASCOTA - 1]      || ''),
      notes:      String(r[C.NOTES - 1]        || ''),
      forSIGRE:   String(r[C.SIGRE - 1]).toLowerCase() === 'si',
      sigreDate:  String(r[C.DATA_SIGRE - 1]   || '') || null,
      createdAt:  String(r[C.DATA_CREACIO - 1] || '') || new Date().toISOString(),
    };
  }

  if (entitat === 'tractaments') {
    return {
      id:           String(r[C.ID - 1]              || ''),
      name:         String(r[C.NOM - 1]             || ''),
      medicineId:   String(r[C.MEDICAMENT_ID - 1]   || ''),
      medicineName: String(r[C.MEDICAMENT_NOM - 1]  || ''),
      doseQty:      parseFloat(r[C.DOSIS_QUANTITAT - 1]) || 1,
      frequency:    String(r[C.FREQUENCIA - 1]      || 'once'),
      instructions: String(r[C.INSTRUCCIONS - 1]    || ''),
      startDate:    String(r[C.DATA_INICI - 1]      || '') || null,
      endDate:      String(r[C.DATA_FI - 1]         || '') || null,
      active:       String(r[C.ACTIU - 1]).toLowerCase() === 'si',
      createdAt:    String(r[C.DATA_CREACIO - 1]    || '') || new Date().toISOString(),
    };
  }

  if (entitat === 'dosis') {
    return {
      id:           String(r[C.ID - 1]              || ''),
      treatmentId:  String(r[C.TRACTAMENT_ID - 1]   || ''),
      medicineId:   String(r[C.MEDICAMENT_ID - 1]   || ''),
      medicineName: String(r[C.MEDICAMENT_NOM - 1]  || ''),
      quantity:     parseFloat(r[C.QUANTITAT - 1])  || 0,
      date:         String(r[C.DATA - 1]            || ''),
      time:         fmtTime(r[C.HORA - 1]),
      notes:        String(r[C.NOTES - 1]           || ''),
      createdAt:    String(r[C.DATA_CREACIO - 1]    || '') || new Date().toISOString(),
    };
  }

  return {};
}

// ── jsonResponse ──────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── initSheets (utilitat: crear pestanyes i capçaleres) ───────
// Executa manualment des de Apps Script > Executar > initSheets
// per crear les 3 pestanyes amb les capçaleres correctes.
function initSheets() {
  const ss = getSpreadsheet();
  const validNames = new Set(Object.values(CFG).map(c => c.SHEET_NAME));

  Object.values(CFG).forEach(cfg => {
    let sheet = ss.getSheetByName(cfg.SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.SHEET_NAME);
    }
    // Escriu capçaleres a la fila 1 si estan buides
    const existing = sheet.getRange(1, 1, 1, cfg.TOTAL_COLS).getValues()[0];
    if (!existing[0]) {
      sheet.getRange(1, 1, 1, cfg.TOTAL_COLS).setValues([cfg.HEADERS]);
      sheet.getRange(1, 1, 1, cfg.TOTAL_COLS)
        .setBackground('#1E293B')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 120); // ID
      sheet.setColumnWidth(2, 180); // Nom
    }
  });

  // Elimina pestanyes que no pertanyen a MediHome
  // (p.ex. la "Hoja 1" que crea Google per defecte)
  ss.getSheets()
    .filter(s => !validNames.has(s.getName()))
    .forEach(s => ss.deleteSheet(s));

  SpreadsheetApp.getUi().alert('✅ Pestanyes creades correctament!');
}
