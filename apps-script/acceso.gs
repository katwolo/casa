// =====================================================================
// Acceso: claves, permisos de la pareja y registro de intentos fallidos
// ---------------------------------------------------------------------
// Propiedades del script:
//   CLAVE_ADMIN      Tu clave. La pones tú a mano. Acceso total.
//   CLAVE_PAREJA     Clave de tu pareja. Se crea y se quita desde Casa > Ajustes.
//   PERMISOS_PAREJA  Permisos por sección (ninguno / ver / editar). Desde Ajustes.
//   AVISO_EMAIL      'si' para recibir un correo cuando alguien use una clave incorrecta.
//   REGISTRO_FALLOS  Últimos intentos con clave incorrecta. Lo gestiona el script.
// =====================================================================

const PROP = {
  ADMIN: 'CLAVE_ADMIN',
  PAREJA: 'CLAVE_PAREJA',
  PERMISOS: 'PERMISOS_PAREJA',
  AVISO: 'AVISO_EMAIL',
  REGISTRO: 'REGISTRO_FALLOS',
};
const NIVELES = ['ninguno', 'ver', 'editar'];
const MAX_REGISTRO = 50;

// ---------- Identificación ----------
function identificar_(req) {
  const props = PropertiesService.getScriptProperties();
  const admin = (props.getProperty(PROP.ADMIN) || '').trim();
  if (!admin) throw error_('Falta la propiedad CLAVE_ADMIN en las propiedades del script', 'config');

  const clave = String(req.clave || '').trim();
  if (clave && iguales_(clave, admin)) return { rol: 'admin' };

  const pareja = (props.getProperty(PROP.PAREJA) || '').trim();
  if (clave && pareja && iguales_(clave, pareja)) return { rol: 'pareja' };

  registrarFallo_(req);
  Utilities.sleep(1500); // frena a quien pruebe claves a ciegas
  throw error_('Clave incorrecta', 'clave');
}

// Compara resúmenes SHA-256 para que el tiempo no dependa de cuántas letras coinciden.
function iguales_(a, b) {
  const ha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a, Utilities.Charset.UTF_8);
  const hb = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b, Utilities.Charset.UTF_8);
  let dif = 0;
  for (let i = 0; i < ha.length; i++) dif |= ha[i] ^ hb[i];
  return dif === 0;
}

// ---------- Permisos ----------
function leerPermisos_() {
  let guardados = {};
  try {
    guardados = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.PERMISOS) || '{}');
  } catch (e) {}
  const permisos = {};
  LISTA_SECCIONES.forEach(function (s) {
    permisos[s] = NIVELES.indexOf(guardados[s]) >= 0 ? guardados[s] : 'ninguno';
  });
  return permisos;
}

function permisosDe_(usuario) {
  if (usuario.rol === 'admin') {
    const todo = {};
    LISTA_SECCIONES.forEach(function (s) { todo[s] = 'editar'; });
    return todo;
  }
  return leerPermisos_();
}

// tipo: 'ver' o 'editar'
function exigirPermiso_(usuario, seccion, tipo) {
  const nivel = permisosDe_(usuario)[seccion] || 'ninguno';
  if (NIVELES.indexOf(nivel) < NIVELES.indexOf(tipo)) {
    throw error_(tipo === 'ver' ? 'No tienes acceso a esta sección' : 'Solo puedes ver esta sección, no modificarla', 'permiso');
  }
}

function soloAdmin_(usuario) {
  if (usuario.rol !== 'admin') throw error_('Solo la persona administradora puede hacer esto', 'permiso');
}

// ---------- Acciones de administración ----------
function admin_(op, datos) {
  const props = PropertiesService.getScriptProperties();
  switch (op) {
    case 'estado':
      return estado_();

    case 'guardarPermisos': {
      const entrada = datos.permisos || {};
      const permisos = {};
      LISTA_SECCIONES.forEach(function (s) {
        if (NIVELES.indexOf(entrada[s]) < 0) throw error_('Permiso no válido para ' + s, 'datos');
        permisos[s] = entrada[s];
      });
      props.setProperty(PROP.PERMISOS, JSON.stringify(permisos));
      return estado_();
    }

    case 'nuevaClavePareja': {
      const clave = generarClave_();
      props.setProperty(PROP.PAREJA, clave);
      return Object.assign(estado_(), { clave: clave });
    }

    case 'quitarClavePareja':
      props.deleteProperty(PROP.PAREJA);
      return estado_();

    case 'guardarAviso':
      props.setProperty(PROP.AVISO, datos.activo ? 'si' : 'no');
      return estado_();

    case 'borrarRegistro':
      props.deleteProperty(PROP.REGISTRO);
      return estado_();

    default:
      throw error_('Acción de administración desconocida: ' + op, 'accion');
  }
}

function estado_() {
  const props = PropertiesService.getScriptProperties();
  return {
    parejaTieneClave: Boolean((props.getProperty(PROP.PAREJA) || '').trim()),
    permisos: leerPermisos_(),
    aviso: props.getProperty(PROP.AVISO) === 'si',
    correoAviso: Session.getEffectiveUser().getEmail(),
    registro: leerRegistro_(),
  };
}

// Clave legible de 3 bloques: p. ej. "k7mq-x2fp-9wtd"
function generarClave_() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  let s = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) s += '-';
    s += letras[(bytes[i] + 256) % letras.length];
  }
  return s;
}

// ---------- Registro de intentos fallidos ----------
function leerRegistro_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP.REGISTRO) || '[]');
  } catch (e) {
    return [];
  }
}

function registrarFallo_(req) {
  const entrada = {
    fecha: new Date().toISOString(),
    seccion: String(req.seccion || '').slice(0, 20),
    accion: String(req.accion || '').slice(0, 40),
    dispositivo: String(req.dispositivo || '').slice(0, 60),
  };
  try {
    withLock_(function () {
      const lista = leerRegistro_();
      lista.unshift(entrada);
      PropertiesService.getScriptProperties().setProperty(PROP.REGISTRO, JSON.stringify(lista.slice(0, MAX_REGISTRO)));
    });
    avisarFallo_(entrada);
  } catch (e) {
    console.error('No se pudo registrar el intento fallido: ' + e.message);
  }
}

// Como mucho un correo por hora, para no llenar el buzón si alguien insiste.
function avisarFallo_(entrada) {
  if (PropertiesService.getScriptProperties().getProperty(PROP.AVISO) !== 'si') return;
  const cache = CacheService.getScriptCache();
  if (cache.get('avisoReciente')) return;
  cache.put('avisoReciente', '1', 3600);
  const fecha = Utilities.formatDate(new Date(entrada.fecha), 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    'Casa: intento de acceso con clave incorrecta',
    'Alguien ha intentado entrar en Casa con una clave incorrecta.\n\n' +
      'Fecha: ' + fecha + '\n' +
      'Sección: ' + (entrada.seccion || '-') + '\n' +
      'Acción: ' + (entrada.accion || '-') + '\n' +
      'Dispositivo: ' + (entrada.dispositivo || 'desconocido') + '\n\n' +
      'Puedes ver todos los intentos en Casa > Ajustes > Seguridad.\n' +
      'Si ha pasado más de una vez, cambia tus claves. Durante la próxima hora no recibirás más avisos.'
  );
}
