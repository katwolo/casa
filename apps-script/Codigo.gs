// =====================================================================
// Casa · script único para todas las secciones
// ---------------------------------------------------------------------
// Las claves NO van aquí: están en Configuración del proyecto >
// Propiedades del script (ver acceso.gs). Así puedes pegar versiones
// nuevas de los archivos sin tocarlas.
//
// Petición (POST, cuerpo JSON en texto):
//   { clave, seccion, accion, datos, dispositivo }
// Respuesta:
//   { ok: true, ... }  o  { ok: false, error, codigo }
// =====================================================================

const VERSION = '8';

// Secciones de casa, en el orden de la portada.
const LISTA_SECCIONES = ['comidas', 'botiquin', 'garaje', 'pesos', 'economia', 'notes'];

// Secciones ya migradas a este script. Cada una vive en su propio archivo
// (comidas.gs, botiquin.gs...) y define un objeto con sus acciones:
//   const SECCION_COMIDAS = { acciones: { listar: { tipo: 'ver', fn: ... }, guardar: { tipo: 'editar', fn: ... } } };
// Al migrar una sección, añádela aquí.
function seccionesMigradas_() {
  return {
    comidas: SECCION_COMIDAS,
    botiquin: SECCION_BOTIQUIN,
    pesos: SECCION_PESOS,
    garaje: SECCION_GARAJE,
    economia: SECCION_ECONOMIA,
    notes: SECCION_NOTES,
  };
}

// ---------- Entradas web ----------
function doGet() {
  return json_({ ok: true, app: 'Casa', version: VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Petición no válida', codigo: 'peticion' });
  }
  try {
    const usuario = identificar_(req);
    return json_(Object.assign({ ok: true }, atender_(usuario, req)));
  } catch (err) {
    return json_({ ok: false, error: err.message, codigo: err.codigo || 'error' });
  }
}

function atender_(usuario, req) {
  const accion = String(req.accion || '');

  if (accion === 'quienSoy') {
    return { rol: usuario.rol, permisos: permisosDe_(usuario), migradas: Object.keys(seccionesMigradas_()) };
  }

  if (accion.indexOf('admin.') === 0) {
    soloAdmin_(usuario);
    return admin_(accion.slice(6), req.datos || {});
  }

  const seccion = String(req.seccion || '');
  if (LISTA_SECCIONES.indexOf(seccion) < 0) throw error_('Sección desconocida: ' + seccion, 'seccion');
  const modulo = seccionesMigradas_()[seccion];
  if (!modulo) throw error_('La sección "' + seccion + '" todavía no está migrada a Casa', 'seccion');
  const def = modulo.acciones[accion];
  if (!def) throw error_('Acción desconocida: ' + accion, 'accion');

  exigirPermiso_(usuario, seccion, def.tipo);
  return { datos: def.fn(req.datos || {}, usuario) };
}

// ---------- Autorización ----------
// Ejecútala a mano desde el editor (selecciónala arriba y pulsa ▶ Ejecutar)
// cuando el script dé un error de permisos. Google mostrará la ventana para
// autorizar el acceso a tus hojas y al correo. Después, publica una versión nueva.
function autorizar() {
  const props = PropertiesService.getScriptProperties();
  ['COMIDAS_SPREADSHEET_ID', 'BOTIQUIN_SPREADSHEET_ID', 'PESOS_SPREADSHEET_ID', 'GARAJE_SS_ID', 'ECONOMIA_SPREADSHEET_ID', 'NOTES_SPREADSHEET_ID'].forEach(function (p) {
    const id = props.getProperty(p);
    if (!id) {
      console.log(p + ': falta la propiedad');
      return;
    }
    try {
      console.log(p + ': ' + SpreadsheetApp.openById(id).getName() + ' ✓');
    } catch (e) {
      console.log(p + ': no se puede abrir (' + e.message + ')');
    }
  });
  ['GARAJE_ROOT_ID', 'ECONOMIA_FOLDER_ID', 'NOTES_FOLDER_ID'].forEach(function (p) {
    const carpeta = props.getProperty(p);
    if (!carpeta) {
      console.log(p + ': falta la propiedad');
      return;
    }
    try {
      console.log(p + ': ' + DriveApp.getFolderById(carpeta).getName() + ' ✓');
    } catch (e) {
      console.log(p + ': no se puede abrir (' + e.message + ')');
    }
  });
  // Garaje lee las facturas con el OCR de Drive a través de una conexión externa.
  try {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    });
    console.log('Lectura de facturas (OCR de Drive): ✓');
  } catch (e) {
    console.log('Lectura de facturas (OCR de Drive): sin permiso (' + e.message + ')');
  }
  console.log('Correo para avisos: ' + Session.getEffectiveUser().getEmail());
  console.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

// ---------- Utilidades ----------
function error_(mensaje, codigo) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
