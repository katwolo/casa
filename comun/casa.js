// Casa: conexión con el script Casa y preferencias de este dispositivo.
// La usan la portada, Ajustes y, cuando se migren, las secciones.
// Se carga en <head> para aplicar el tema antes de pintar la página.
(function () {
  // URL /exec del script Casa. Si la pegas aquí, en Ajustes solo hará falta la clave.
  const URL_POR_DEFECTO = '';

  const SECCIONES = [
    { id: 'comidas', nombre: 'Planificación de comidas', emoji: '🍲', href: 'https://katwolo.github.io/si_chef/' },
    { id: 'botiquin', nombre: 'Botiquín', emoji: '💊', href: 'https://katwolo.github.io/MediHome/' },
    { id: 'garaje', nombre: 'Garaje', emoji: '🔧', href: 'https://katwolo.github.io/garatge/' },
    { id: 'pesos', nombre: 'Registro de pesos', emoji: '⚖️', href: 'https://katwolo.github.io/registro-peso/' },
    { id: 'economia', nombre: 'Economía', emoji: '💶', href: 'https://katwolo.github.io/economia/' },
    { id: 'notes', nombre: 'Notes', emoji: '📝', href: 'https://katwolo.github.io/diario/#/crear' },
  ];
  const IDS = SECCIONES.map(function (s) { return s.id; });

  const K_CONEXION = 'casa.conexion';
  const K_PREFS = 'casa.preferencias';

  function leer(k) {
    try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; }
  }
  function escribir(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  // ---------- Conexión ----------
  function conexion() {
    const c = Object.assign({ url: '', clave: '', rol: '', permisos: null }, leer(K_CONEXION));
    if (!c.url) c.url = URL_POR_DEFECTO;
    return c;
  }
  function guardarConexion(cambios) {
    escribir(K_CONEXION, Object.assign(conexion(), cambios));
  }
  function olvidarConexion() {
    try { localStorage.removeItem(K_CONEXION); } catch (e) {}
  }

  // Nombre corto del dispositivo para el registro de intentos fallidos.
  function dispositivo() {
    const ua = navigator.userAgent;
    const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
      : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Otro';
    const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : 'navegador';
    return so + ' · ' + nav;
  }

  async function llamar(seccion, accion, datos, opciones) {
    const c = Object.assign(conexion(), opciones || {});
    if (!c.url) throw new Error('Falta la URL del script Casa. Añádela en Ajustes.');
    if (!c.clave) throw new Error('Falta la clave. Escríbela en Ajustes.');
    let res;
    try {
      res = await fetch(c.url, {
        method: 'POST',
        // text/plain evita la comprobación previa (CORS) que Apps Script no admite
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ clave: c.clave, seccion: seccion, accion: accion, datos: datos || {}, dispositivo: dispositivo() }),
      });
    } catch (e) {
      throw new Error('No se ha podido contactar con el script. Revisa la conexión a internet y la URL.');
    }
    let j;
    try { j = await res.json(); } catch (e) {
      throw new Error('El script no ha respondido como se esperaba. Revisa que la URL acabe en /exec y que esté publicado para «Cualquier usuario».');
    }
    if (!j.ok) {
      const err = new Error(j.error || 'Error desconocido');
      err.codigo = j.codigo;
      throw err;
    }
    return j;
  }

  // Comprueba la clave y guarda el rol y los permisos para usarlos sin conexión.
  async function comprobar(opciones) {
    const j = await llamar('', 'quienSoy', {}, opciones);
    guardarConexion(Object.assign({}, opciones || {}, { rol: j.rol, permisos: j.permisos }));
    return j;
  }

  // Permiso guardado para una sección: 'editar', 'ver', 'ninguno', o null si no hay conexión.
  function permiso(id) {
    const c = conexion();
    if (!c.rol || !c.permisos) return null;
    return c.permisos[id] || 'ninguno';
  }

  // ---------- Preferencias de este dispositivo ----------
  function preferencias() {
    const p = Object.assign({ tema: 'auto', nombre: '', orden: [], ocultas: [] }, leer(K_PREFS));
    // Orden siempre completo: lo guardado primero y luego cualquier sección nueva.
    p.orden = p.orden.filter(function (id) { return IDS.indexOf(id) >= 0; });
    IDS.forEach(function (id) { if (p.orden.indexOf(id) < 0) p.orden.push(id); });
    p.ocultas = p.ocultas.filter(function (id) { return IDS.indexOf(id) >= 0; });
    return p;
  }
  function guardarPreferencias(cambios) {
    escribir(K_PREFS, Object.assign(preferencias(), cambios));
    aplicarTema();
  }
  function aplicarTema() {
    const t = preferencias().tema;
    const raiz = document.documentElement;
    if (t === 'claro') raiz.setAttribute('data-theme', 'light');
    else if (t === 'oscuro') raiz.setAttribute('data-theme', 'dark');
    else raiz.removeAttribute('data-theme');
  }

  window.Casa = {
    SECCIONES: SECCIONES,
    conexion: conexion,
    guardarConexion: guardarConexion,
    olvidarConexion: olvidarConexion,
    llamar: llamar,
    comprobar: comprobar,
    permiso: permiso,
    preferencias: preferencias,
    guardarPreferencias: guardarPreferencias,
    aplicarTema: aplicarTema,
  };

  aplicarTema();
})();
