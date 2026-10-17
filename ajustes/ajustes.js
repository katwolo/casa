// Ajustes de Casa
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const NIVELES = [['ninguno', 'Nada'], ['ver', 'Ver'], ['editar', 'Editar']];

  function seccion(id) {
    return Casa.SECCIONES.find(function (s) { return s.id === id; });
  }
  function filaSeccion(s) {
    const li = document.createElement('li');
    li.className = 'fila s-' + s.id;
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = s.emoji;
    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = s.nombre;
    li.append(emoji, nombre);
    return li;
  }
  function mostrarEstado(el, tipo, texto) {
    el.className = 'estado ' + tipo;
    el.textContent = texto;
  }
  async function conBoton(boton, fn) {
    boton.disabled = true;
    try { return await fn(); } finally { boton.disabled = false; }
  }

  // ---------- Conexión ----------
  const ROLES = { admin: 'administradora (acceso total)', pareja: 'pareja' };

  function pintarConexion() {
    const c = Casa.conexion();
    $('i-url').value = c.url || '';
    $('i-clave').value = c.clave || '';
    $('b-desconectar').hidden = !c.clave;
    if (c.rol) {
      let texto = 'Conectado como ' + ROLES[c.rol] + '.';
      if (c.rol === 'pareja' && c.permisos) {
        const grupos = { editar: [], ver: [], ninguno: [] };
        Casa.SECCIONES.forEach(function (s) { grupos[c.permisos[s.id] || 'ninguno'].push(s.nombre); });
        if (grupos.editar.length) texto += ' Puedes editar: ' + grupos.editar.join(', ') + '.';
        if (grupos.ver.length) texto += ' Solo ver: ' + grupos.ver.join(', ') + '.';
      }
      mostrarEstado($('estado-conexion'), 'ok', texto);
    } else {
      mostrarEstado($('estado-conexion'), 'info', 'Este dispositivo no está conectado.');
    }
    const esAdmin = c.rol === 'admin';
    $('sec-pareja').hidden = !esAdmin;
    $('sec-seguridad').hidden = !esAdmin;
    // Lo que se lista depende de los permisos de quien está conectado.
    pintarPortada();
    pintarEnlaces();
  }

  $('f-conexion').addEventListener('submit', function (e) {
    e.preventDefault();
    const url = $('i-url').value.trim();
    const clave = $('i-clave').value.trim();
    conBoton($('b-conectar'), async function () {
      mostrarEstado($('estado-conexion'), 'info', 'Comprobando la clave…');
      try {
        await Casa.comprobar({ url: url, clave: clave });
        pintarConexion();
        if (Casa.conexion().rol === 'admin') cargarAdmin();
      } catch (err) {
        mostrarEstado($('estado-conexion'), 'error', err.message);
      }
    });
  });

  $('b-desconectar').addEventListener('click', function () {
    Casa.olvidarConexion();
    pintarConexion();
  });

  // ---------- Portada (este dispositivo) ----------
  function pintarPortada() {
    const p = Casa.preferencias();
    $('tema-' + p.tema).checked = true;
    $('i-nombre').value = p.nombre;
    const ul = $('lista-portada');
    ul.textContent = '';
    // Las secciones sin acceso no aparecen, como si no existieran.
    const lista = p.orden.filter(Casa.tieneAcceso);
    lista.forEach(function (id, i) {
      const s = seccion(id);
      const li = filaSeccion(s);

      const vis = document.createElement('label');
      vis.className = 'visible';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.id = 'ver-' + id;
      check.checked = p.ocultas.indexOf(id) < 0;
      check.addEventListener('change', function () {
        const ocultas = Casa.preferencias().ocultas.filter(function (x) { return x !== id; });
        if (!check.checked) ocultas.push(id);
        Casa.guardarPreferencias({ ocultas: ocultas });
      });
      vis.append(check, document.createTextNode('Mostrar'));

      const mover = document.createElement('span');
      mover.className = 'mover';
      [['↑', -1, 'Subir'], ['↓', 1, 'Bajar']].forEach(function (m) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = m[0];
        b.setAttribute('aria-label', m[2] + ' ' + s.nombre);
        const destino = i + m[1];
        b.disabled = destino < 0 || destino >= lista.length;
        b.addEventListener('click', function () {
          // Intercambia con la sección visible de al lado; las ocultas no se mueven.
          const orden = Casa.preferencias().orden;
          const a = orden.indexOf(lista[i]);
          const c = orden.indexOf(lista[destino]);
          orden[a] = lista[destino];
          orden[c] = lista[i];
          Casa.guardarPreferencias({ orden: orden });
          pintarPortada();
          const foco = ul.children[destino] && ul.children[destino].querySelector('[aria-label^="' + m[2] + '"]');
          if (foco && !foco.disabled) foco.focus();
        });
        mover.appendChild(b);
      });

      li.append(vis, mover);
      ul.appendChild(li);
    });
  }

  document.querySelectorAll('input[name="tema"]').forEach(function (r) {
    r.addEventListener('change', function () { Casa.guardarPreferencias({ tema: r.value }); });
  });
  $('i-nombre').addEventListener('input', function () {
    Casa.guardarPreferencias({ nombre: $('i-nombre').value.trim() });
  });

  // ---------- Pareja y seguridad (solo administrador) ----------
  function pintarPermisos(permisos) {
    const ul = $('lista-permisos');
    ul.textContent = '';
    Casa.SECCIONES.forEach(function (s) {
      const li = filaSeccion(s);
      const grupo = document.createElement('span');
      grupo.className = 'segmentos';
      grupo.setAttribute('role', 'radiogroup');
      grupo.setAttribute('aria-label', 'Permiso en ' + s.nombre);
      NIVELES.forEach(function (n) {
        const l = document.createElement('label');
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'perm-' + s.id;
        r.id = 'perm-' + s.id + '-' + n[0];
        r.value = n[0];
        r.checked = (permisos[s.id] || 'ninguno') === n[0];
        const t = document.createElement('span');
        t.textContent = n[1];
        l.append(r, t);
        grupo.appendChild(l);
      });
      li.appendChild(grupo);
      ul.appendChild(li);
    });
  }

  function pintarRegistro(registro) {
    const ul = $('lista-registro');
    ul.textContent = '';
    if (!registro.length) {
      const p = document.createElement('p');
      p.className = 'vacio';
      p.textContent = 'No hay intentos fallidos.';
      ul.appendChild(p);
      return;
    }
    registro.forEach(function (r) {
      const li = document.createElement('li');
      li.className = 'fila';
      const t = document.createElement('time');
      t.dateTime = r.fecha;
      t.textContent = new Date(r.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      const d = document.createElement('span');
      d.className = 'det';
      const s = seccion(r.seccion);
      d.textContent = [r.dispositivo || 'Dispositivo desconocido', s ? s.nombre : (r.accion === 'quienSoy' ? 'Ajustes' : r.seccion)]
        .filter(Boolean).join(' · ');
      li.append(t, d);
      ul.appendChild(li);
    });
  }

  function pintarAdmin(e) {
    mostrarEstado($('estado-pareja'), e.parejaTieneClave ? 'ok' : 'info',
      e.parejaTieneClave ? 'Tu pareja tiene una clave activa.' : 'Tu pareja todavía no tiene clave.');
    $('b-nueva-clave').textContent = e.parejaTieneClave ? 'Cambiar su clave' : 'Crear clave';
    $('b-quitar-clave').hidden = !e.parejaTieneClave;
    pintarPermisos(e.permisos);
    $('i-aviso').checked = e.aviso;
    $('t-aviso').textContent = 'Avisarme por correo' + (e.correoAviso ? ' (' + e.correoAviso + ')' : '') + ', como mucho uno por hora';
    pintarRegistro(e.registro || []);
  }

  async function admin(accion, datos) {
    const j = await Casa.llamar('', 'admin.' + accion, datos);
    pintarAdmin(j);
    return j;
  }

  async function cargarAdmin() {
    try {
      await admin('estado');
    } catch (err) {
      mostrarEstado($('estado-pareja'), 'error', err.message);
    }
  }

  function errorPareja(err) {
    mostrarEstado($('estado-pareja'), 'error', err.message);
  }

  $('b-nueva-clave').addEventListener('click', function () {
    const b = this;
    conBoton(b, async function () {
      try {
        const j = await admin('nuevaClavePareja');
        $('clave-nueva-texto').textContent = j.clave;
        $('clave-nueva').hidden = false;
      } catch (err) { errorPareja(err); }
    });
  });

  $('b-copiar').addEventListener('click', function () {
    const texto = $('clave-nueva-texto').textContent;
    const b = this;
    navigator.clipboard.writeText(texto).then(function () {
      b.textContent = 'Copiada';
      setTimeout(function () { b.textContent = 'Copiar clave'; }, 2000);
    }, function () {
      const r = document.createRange();
      r.selectNodeContents($('clave-nueva-texto'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
  });

  // Confirmación en dos pasos: el primer clic pide confirmar.
  function conConfirmacion(boton, textoConfirmar, accion) {
    const original = boton.textContent;
    let armado = false;
    boton.addEventListener('click', function () {
      if (!armado) {
        armado = true;
        boton.textContent = textoConfirmar;
        setTimeout(function () { armado = false; boton.textContent = original; }, 4000);
        return;
      }
      armado = false;
      boton.textContent = original;
      conBoton(boton, accion);
    });
  }

  conConfirmacion($('b-quitar-clave'), 'Pulsa otra vez para quitar el acceso', async function () {
    try {
      await admin('quitarClavePareja');
      $('clave-nueva').hidden = true;
    } catch (err) { errorPareja(err); }
  });

  $('b-guardar-permisos').addEventListener('click', function () {
    const permisos = {};
    Casa.SECCIONES.forEach(function (s) {
      const r = document.querySelector('input[name="perm-' + s.id + '"]:checked');
      permisos[s.id] = r ? r.value : 'ninguno';
    });
    const b = this;
    conBoton(b, async function () {
      try {
        await admin('guardarPermisos', { permisos: permisos });
        b.textContent = 'Guardado';
        setTimeout(function () { b.textContent = 'Guardar permisos'; }, 2000);
      } catch (err) { errorPareja(err); }
    });
  });

  $('i-aviso').addEventListener('change', function () {
    const activo = this.checked;
    admin('guardarAviso', { activo: activo }).catch(function (err) {
      $('i-aviso').checked = !activo;
      errorPareja(err);
    });
  });

  conConfirmacion($('b-borrar-registro'), 'Pulsa otra vez para borrar', async function () {
    try { await admin('borrarRegistro'); } catch (err) { errorPareja(err); }
  });

  // ---------- Enlaces a las secciones ----------
  function pintarEnlaces() {
    $('lista-enlaces').textContent = '';
    Casa.SECCIONES.filter(function (s) { return Casa.tieneAcceso(s.id); }).forEach(function (s) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.href;
      const fila = filaSeccion(s);
      const flecha = document.createElement('span');
      flecha.className = 'flecha';
      flecha.textContent = 'Abrir →';
      fila.appendChild(flecha);
      a.appendChild(fila);
      li.appendChild(a);
      $('lista-enlaces').appendChild(li);
    });
  }

  // ---------- Inicio ----------
  pintarConexion();
  const c = Casa.conexion();
  if (c.clave && c.url) {
    // Refresca rol y permisos por si han cambiado desde otro dispositivo.
    Casa.comprobar().then(function () {
      pintarConexion();
      if (Casa.conexion().rol === 'admin') cargarAdmin();
    }, function (err) {
      if (err.codigo === 'clave') {
        Casa.guardarConexion({ rol: '', permisos: null });
        pintarConexion();
      }
      mostrarEstado($('estado-conexion'), 'error', err.message);
    });
  }
})();
