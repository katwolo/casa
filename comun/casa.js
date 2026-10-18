// Casa: conexión con el script Casa y preferencias de este dispositivo.
// La usan la portada, Ajustes y, cuando se migren, las secciones.
// Se carga en <head> para aplicar el tema antes de pintar la página.
(function () {
  // URL /exec del script Casa. Si la pegas aquí, en Ajustes solo hará falta la clave.
  const URL_POR_DEFECTO = 'https://script.google.com/macros/s/AKfycbxHeT72S7BAxcLIu-ZVyvN9xunwag1T73wGWbzKHc2a3yHdWCDdi77FC7sLaP4Yxw/exec';

  // Raíz de Casa, calculada a partir de este archivo (comun/casa.js), para que
  // los enlaces funcionen igual desde la portada, Ajustes o una sección.
  const RAIZ = new URL('../', document.currentScript.src).href;

  // Cada sección vive en su carpeta dentro de Casa.
  const SECCIONES = [
    { id: 'comidas', nombre: 'Planificación de comidas', emoji: '🍲', href: RAIZ + 'comidas/' },
    { id: 'botiquin', nombre: 'Botiquín', emoji: '💊', href: RAIZ + 'botiquin/' },
    { id: 'garaje', nombre: 'Garaje', emoji: '🔧', href: RAIZ + 'garaje/' },
    { id: 'pesos', nombre: 'Registro de pesos', emoji: '⚖️', href: RAIZ + 'pesos/' },
    { id: 'economia', nombre: 'Economía', emoji: '💶', href: RAIZ + 'economia/' },
    { id: 'notes', nombre: 'Notes', emoji: '📝', href: RAIZ + 'notes/#/crear' },
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

  // Si este dispositivo puede ver la sección. Sin conexión se muestran todas.
  function tieneAcceso(id) {
    return permiso(id) !== 'ninguno';
  }

  // ---------- Imágenes para Gemini ----------
  // Prepara una foto (File/Blob) o un canvas para enviarla al script: JPEG de hasta
  // 2400 px por lado, suficiente para letra pequeña sin pasarse de tamaño.
  async function imagenParaIA(fuente, max, calidad) {
    max = max || 2400;
    calidad = calidad || 0.92;
    let origen = fuente, ancho, alto, liberar = null;
    if (fuente instanceof HTMLCanvasElement) {
      ancho = fuente.width;
      alto = fuente.height;
    } else {
      origen = await createImageBitmap(fuente, { imageOrientation: 'from-image' });
      ancho = origen.width;
      alto = origen.height;
      liberar = () => origen.close && origen.close();
    }
    const escala = Math.min(1, max / Math.max(ancho, alto));
    const c = document.createElement('canvas');
    c.width = Math.round(ancho * escala);
    c.height = Math.round(alto * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(origen, 0, 0, c.width, c.height);
    if (liberar) liberar();
    return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', calidad).split(',')[1] };
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
    RAIZ: RAIZ,
    SECCIONES: SECCIONES,
    conexion: conexion,
    guardarConexion: guardarConexion,
    olvidarConexion: olvidarConexion,
    llamar: llamar,
    comprobar: comprobar,
    permiso: permiso,
    tieneAcceso: tieneAcceso,
    imagenParaIA: imagenParaIA,
    preferencias: preferencias,
    guardarPreferencias: guardarPreferencias,
    aplicarTema: aplicarTema,
  };

  aplicarTema();
})();
