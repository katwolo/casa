(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycby1dyy1cuGyEY8dSQp94_P5vVmjvDafjFLWz_yVFLlB3-lLwt_m2PAPCtMpy8ELg7T8/exec';

  var state = {
    profiles: [],
    profileKey: null,
    data: null,
    range: 90
  };

  var METRIC_LABELS = {
    grasa: { label: '% grasa corporal', decimals: 1, unit: '%', scale: 100 },
    masaMagra: { label: 'Masa magra', decimals: 1, unit: 'kg', scale: 1 },
    edad: { label: 'Edad metabólica', decimals: 0, unit: 'años', scale: 1 },
    grasaVisceral: { label: 'Grasa visceral', decimals: 1, unit: 'kg', scale: 1 }
  };

  // ---------------------------------------------------------------- utils

  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') el.className = props[k];
        else if (k === 'text') el.textContent = props[k];
        else if (k.indexOf('on') === 0 && typeof props[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else {
          el.setAttribute(k, props[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function svg(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // Ícono armado con primitivas SVG (círculos/líneas), no con el emoji ⚙️:
  // ese emoji necesita la fuente de color del sistema y en algunos
  // navegadores/Android queda en blanco en vez de mostrar el engranaje.
  function gearIconSvg_() {
    var root = svg('svg', {
      viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round'
    });
    root.appendChild(svg('circle', { cx: 12, cy: 12, r: 6 }));
    root.appendChild(svg('circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor', stroke: 'none' }));
    [
      [19.5, 12, 22, 12],
      [15.75, 18.495, 17, 20.66],
      [8.25, 18.495, 7, 20.66],
      [4.5, 12, 2, 12],
      [8.25, 5.505, 7, 3.34],
      [15.75, 5.505, 17, 3.34]
    ].forEach(function (t) {
      root.appendChild(svg('line', { x1: t[0], y1: t[1], x2: t[2], y2: t[3] }));
    });
    return root;
  }

  function fmtNum(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var d = decimals === undefined ? 1 : decimals;
    return n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtShortDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  }

  function fmtFullDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function todayLocalISO() {
    var d = new Date();
    var tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 10);
  }

  function deltaInfo(delta, goodDirection, decimals) {
    if (delta === null || delta === undefined || isNaN(delta)) return null;
    var arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
    var cls = 'neutral';
    if (goodDirection && delta !== 0) {
      var movingUp = delta > 0;
      var isGood = (goodDirection === 'up' && movingUp) || (goodDirection === 'down' && !movingUp);
      cls = isGood ? 'good' : 'bad';
    }
    return { text: arrow + ' ' + fmtNum(Math.abs(delta), decimals), cls: cls };
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(function () { toast.classList.remove('visible'); }, 2400);
  }

  function showError(err) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    var msg = err && err.message ? err.message : String(err);
    app.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-title', text: 'Ocurrió un error' }),
      h('div', { text: msg }),
      h('button', {
        class: 'btn-primary', style: 'margin-top:14px;width:auto;padding:10px 16px;',
        onClick: function () { location.hash = ''; route(); }
      }, ['Volver'])
    ]));
  }

  function apiGet(action, params) {
    var url = new URL(API_URL);
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
    return fetch(url.toString()).then(function (r) { return r.json(); }).then(unwrapApiResult_);
  }

  // El POST manda text/plain (no application/json) a propósito: así el
  // pedido cross-origin queda como "simple request" y el navegador no
  // dispara un preflight OPTIONS, que Apps Script no puede responder.
  function apiPost(action, data) {
    var body = Object.assign({ action: action }, data);
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(unwrapApiResult_);
  }

  function unwrapApiResult_(payload) {
    if (!payload.ok) throw new Error(payload.error || 'Error desconocido');
    return payload.result;
  }

  // -------------------------------------------------------------- routing

  function route() {
    var hash = location.hash.replace('#', '');
    if (hash.indexOf('/profile/') === 0) {
      openProfile(hash.split('/profile/')[1]);
    } else {
      renderPicker();
    }
  }
  window.addEventListener('hashchange', route);

  function init() {
    apiGet('profiles').then(function (profiles) {
      state.profiles = profiles;
      route();
    }).catch(showError);
  }

  // -------------------------------------------------------------- picker

  function renderPicker() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var header = h('div', { class: 'picker-header' }, [
      h('div', {}, [
        h('div', { class: 'picker-title', text: 'Registro de Peso' }),
        h('div', { class: 'picker-subtitle', text: 'Elegí un perfil para ver su evolución' })
      ]),
      h('button', { class: 'gear-btn', type: 'button', title: 'Gestionar perfiles', onClick: openManageProfiles }, [gearIconSvg_()])
    ]);
    app.appendChild(header);

    var grid = h('div', { class: 'profile-grid' });
    state.profiles.forEach(function (p) {
      grid.appendChild(h('div', {
        class: 'profile-card',
        onClick: function () { location.hash = '/profile/' + p.key; }
      }, [
        h('span', { class: 'profile-icon', text: p.icon }),
        h('div', { class: 'profile-name', text: p.name }),
        h('div', { class: 'profile-type', text: p.category })
      ]));
    });
    app.appendChild(grid);
  }

  // ------------------------------------------------- gestión de perfiles

  var QUICK_EMOJI = ['🧔', '👩', '👨', '👧', '👦', '👶', '🐱', '🐶', '🐹', '🐰', '🐦', '🐢', '🐠', '🦊', '🐻'];

  function openManageProfiles() {
    var backdrop = h('div', { class: 'modal-backdrop', onClick: function (e) { if (e.target === backdrop) close(); } });
    var modal = h('div', { class: 'modal' });
    backdrop.appendChild(modal);
    modal.appendChild(h('div', { class: 'modal-title', text: 'Gestionar perfiles' }));

    var list = h('div', { class: 'manage-list' });
    state.profiles.forEach(function (p) {
      list.appendChild(h('div', { class: 'manage-row' }, [
        h('span', { class: 'manage-icon', text: p.icon }),
        h('div', { class: 'manage-info' }, [
          h('div', { class: 'manage-name', text: p.name }),
          h('div', { class: 'manage-category', text: p.category })
        ]),
        h('button', {
          type: 'button', class: 'icon-btn', title: 'Editar perfil',
          onClick: function () { close(); openProfileForm(p); }
        }, ['✏️']),
        h('button', {
          type: 'button', class: 'icon-btn', title: 'Borrar perfil',
          onClick: function () { handleDelete(p); }
        }, ['🗑️'])
      ]));
    });
    modal.appendChild(list);

    modal.appendChild(h('button', {
      type: 'button', class: 'btn-primary', style: 'margin-top:14px;width:100%;',
      onClick: function () { close(); openProfileForm(null); }
    }, ['+ Crear perfil']));
    modal.appendChild(h('button', {
      type: 'button', class: 'btn-secondary', style: 'margin-top:10px;width:100%;', onClick: close
    }, ['Cerrar']));

    document.body.appendChild(backdrop);
    function close() { backdrop.remove(); }

    function handleDelete(p) {
      var sure = confirm('¿Borrar el perfil "' + p.name + '"?\n\nLa hoja con su historial en la planilla NO se borra, solo deja de mostrarse en la app.');
      if (!sure) return;
      apiPost('deleteProfile', { key: p.key }).then(function (profiles) {
        state.profiles = profiles;
        close();
        showToast('Perfil borrado');
        renderPicker();
      }).catch(function (err) {
        alert(err && err.message ? err.message : 'No se pudo borrar el perfil.');
      });
    }
  }

  function openProfileForm(existing) {
    var isEdit = !!existing;
    var backdrop = h('div', { class: 'modal-backdrop', onClick: function (e) { if (e.target === backdrop) close(); } });
    var modal = h('div', { class: 'modal' });
    backdrop.appendChild(modal);
    modal.appendChild(h('div', { class: 'modal-title', text: isEdit ? 'Editar perfil' : 'Crear perfil' }));

    var form = h('form', {});
    var fields = {};

    function field(key, label, type, opts) {
      opts = opts || {};
      var input = h('input', Object.assign({ type: type, name: key }, opts));
      fields[key] = input;
      form.appendChild(h('div', { class: 'field' }, [h('label', { text: label }), input]));
      return input;
    }

    field('name', 'Nombre', 'text', {
      required: 'required', value: isEdit ? existing.name : '', placeholder: 'Ej: María'
    });

    var dataTypeWrap = h('div', { class: 'field' });
    dataTypeWrap.appendChild(h('label', { text: 'Tipo de perfil' }));
    var dataTypeSelect = h('select', { name: 'dataType' }, [
      h('option', { value: 'simple' }, ['Solo peso (bebé o mascota)']),
      h('option', { value: 'full' }, ['Persona (peso + %grasa, masa magra, edad, grasa visceral y objetivos)'])
    ]);
    dataTypeSelect.value = isEdit ? existing.dataType : 'simple';
    if (isEdit) {
      dataTypeSelect.disabled = true;
      dataTypeWrap.appendChild(h('div', { style: 'font-size:11px;color:var(--text-muted);margin-top:4px;', text: 'No se puede cambiar el tipo después de creado.' }));
    }
    dataTypeWrap.appendChild(dataTypeSelect);
    form.appendChild(dataTypeWrap);

    field('category', 'Categoría (se muestra en la tarjeta)', 'text', {
      value: isEdit ? existing.category : '', placeholder: 'Persona / Bebé / Mascota', list: 'category-suggestions'
    });
    var datalist = h('datalist', { id: 'category-suggestions' }, ['Persona', 'Bebé', 'Mascota'].map(function (c) {
      return h('option', { value: c });
    }));
    form.appendChild(datalist);

    var iconInput = field('icon', 'Ícono', 'text', { value: isEdit ? existing.icon : '👤', maxlength: '4' });
    var emojiGrid = h('div', { class: 'emoji-grid' });
    QUICK_EMOJI.forEach(function (emoji) {
      emojiGrid.appendChild(h('button', {
        type: 'button', class: 'emoji-option', onClick: function () { iconInput.value = emoji; }
      }, [emoji]));
    });
    form.appendChild(emojiGrid);

    var weighWrap = h('div', { class: 'field checkbox-field' });
    var weighCheckbox = h('input', { type: 'checkbox', name: 'weighMethod' });
    if (isEdit && existing.weighMethod === 'holding') weighCheckbox.checked = true;
    weighWrap.appendChild(weighCheckbox);
    weighWrap.appendChild(h('label', { text: 'Se pesa en brazos, calculando la resta (como los gatos)' }));
    form.appendChild(weighWrap);

    var objetivoWrap = h('div', {}, [
      h('div', { class: 'card-title', style: 'margin-top:10px;', text: 'Objetivos (opcional)' })
    ]);
    var objetivoFields = {};
    function objField(key, label) {
      var input = h('input', { type: 'number', step: '0.1', min: '0', placeholder: 'Opcional' });
      objetivoFields[key] = input;
      objetivoWrap.appendChild(h('div', { class: 'field' }, [h('label', { text: label }), input]));
    }
    objField('peso', 'Peso objetivo (kg)');
    objField('grasa', '% grasa objetivo');
    objField('masaMagra', 'Masa magra objetivo (kg)');
    objField('edad', 'Edad metabólica objetivo');
    objField('grasaVisceral', 'Grasa visceral objetivo');
    form.appendChild(objetivoWrap);

    function syncVisibility() {
      var isSimple = dataTypeSelect.value === 'simple';
      weighWrap.style.display = isSimple ? 'flex' : 'none';
      objetivoWrap.style.display = isSimple ? 'none' : 'block';
    }
    dataTypeSelect.addEventListener('change', syncVisibility);
    syncVisibility();

    if (isEdit && existing.dataType === 'full') {
      apiGet('data', { profile: existing.key }).then(function (data) {
        var obj = data.objetivo || {};
        if (obj.peso != null) objetivoFields.peso.value = obj.peso;
        if (obj.grasa != null) objetivoFields.grasa.value = (obj.grasa * 100).toFixed(1);
        if (obj.masaMagra != null) objetivoFields.masaMagra.value = obj.masaMagra;
        if (obj.edad != null) objetivoFields.edad.value = obj.edad;
        if (obj.grasaVisceral != null) objetivoFields.grasaVisceral.value = obj.grasaVisceral;
      }).catch(function () { /* si falla la precarga, se editan objetivos en blanco */ });
    }

    var errorBox = h('div', { class: 'form-error', style: 'display:none;' });
    form.appendChild(errorBox);

    var saveBtn = h('button', { type: 'submit', class: 'btn-primary' }, [isEdit ? 'Guardar cambios' : 'Crear perfil']);
    form.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { type: 'button', class: 'btn-secondary', onClick: close }, ['Cancelar']),
      saveBtn
    ]));

    modal.appendChild(form);
    document.body.appendChild(backdrop);
    function close() { backdrop.remove(); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.style.display = 'none';

      var name = fields.name.value.trim();
      if (!name) {
        errorBox.textContent = 'Poné un nombre.';
        errorBox.style.display = 'block';
        return;
      }

      var payload = {
        name: name,
        dataType: dataTypeSelect.value,
        category: fields.category.value.trim(),
        icon: fields.icon.value.trim() || '👤',
        weighMethod: weighCheckbox.checked ? 'holding' : null
      };
      if (dataTypeSelect.value === 'full') {
        payload.objetivo = {};
        Object.keys(objetivoFields).forEach(function (k) { payload.objetivo[k] = objetivoFields[k].value; });
      }
      if (isEdit) payload.key = existing.key;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      apiPost(isEdit ? 'updateProfile' : 'createProfile', payload).then(function (profiles) {
        state.profiles = profiles;
        close();
        showToast(isEdit ? 'Perfil actualizado ✓' : 'Perfil creado ✓');
        renderPicker();
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Crear perfil';
        errorBox.textContent = err && err.message ? err.message : 'No se pudo guardar el perfil.';
        errorBox.style.display = 'block';
      });
    });
  }

  // ----------------------------------------------------------- dashboard

  function openProfile(key) {
    state.profileKey = key;
    state.range = 90;
    var app = document.getElementById('app');
    app.innerHTML = '<div class="loading">Cargando…</div>';
    apiGet('data', { profile: key }).then(function (data) {
      state.data = data;
      renderDashboard();
    }).catch(showError);
  }

  function filteredRecords() {
    var records = state.data.records;
    if (state.range === 'all') return records;
    var last = records.length ? new Date(records[records.length - 1].date + 'T00:00:00') : new Date();
    var cutoff = new Date(last);
    cutoff.setDate(cutoff.getDate() - state.range);
    return records.filter(function (r) { return new Date(r.date + 'T00:00:00') >= cutoff; });
  }

  function renderDashboard() {
    var data = state.data;
    var profile = data.profile;
    var app = document.getElementById('app');
    app.innerHTML = '';

    // header
    app.appendChild(h('div', { class: 'dash-header' }, [
      h('button', { class: 'back-btn', onClick: function () { location.hash = ''; } }, ['←']),
      h('div', { class: 'dash-icon', text: profile.icon }),
      h('div', { class: 'dash-title', text: profile.name }),
      h('button', { class: 'add-btn', onClick: openAddModal }, ['+ Nuevo registro'])
    ]));

    if (!data.records.length) {
      app.appendChild(h('div', { class: 'card' }, [
        h('div', { text: 'Todavía no hay registros para ' + profile.name + '. Agregá el primero.' })
      ]));
      return;
    }

    app.appendChild(renderHeroCard());
    if (profile.dataType === 'full') app.appendChild(renderMetricGrid());
    app.appendChild(renderChartCard());
    app.appendChild(renderHistoryCard());
  }

  function renderHeroCard() {
    var stats = state.data.stats.peso;
    var d7 = deltaInfo(stats.delta7, stats.goodDirection, 1);
    var d30 = deltaInfo(stats.delta30, stats.goodDirection, 1);

    var card = h('div', { class: 'card' }, [
      h('div', { class: 'card-title', text: 'Peso actual' })
    ]);

    var row = h('div', { class: 'hero-row' }, [
      h('div', {}, [
        h('span', { class: 'hero-value', text: fmtNum(stats.current, 1) }),
        h('span', { class: 'hero-unit', text: 'kg' }),
        h('div', { class: 'hero-deltas' }, [
          d7 ? h('span', { class: 'delta ' + d7.cls }, [d7.text, h('span', { class: 'delta-label', text: '7d' })]) : null,
          d30 ? h('span', { class: 'delta ' + d30.cls }, [d30.text, h('span', { class: 'delta-label', text: '30d' })]) : null
        ])
      ]),
      renderSparkline(stats.sparkline)
    ]);
    card.appendChild(row);

    if (stats.goal !== null && stats.goal !== undefined && stats.progress !== null) {
      card.appendChild(renderMeter('Objetivo: ' + fmtNum(stats.goal, 1) + ' kg', stats.progress));
    }
    return card;
  }

  function renderMeter(label, progress) {
    var wrap = h('div', { style: 'margin-top:12px;' });
    var top = h('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px;' }, [
      h('span', { text: label }),
      h('span', { text: Math.round(progress) + '%' })
    ]);
    var track = h('div', { class: 'meter-track' }, [
      h('div', { class: 'meter-fill', style: 'width:' + progress + '%;' })
    ]);
    wrap.appendChild(top);
    wrap.appendChild(track);
    return wrap;
  }

  function renderMetricGrid() {
    var card = h('div', { class: 'card' }, [
      h('div', { class: 'card-title', text: 'Progreso hacia objetivos' })
    ]);
    var grid = h('div', { class: 'metric-grid' });
    Object.keys(METRIC_LABELS).forEach(function (key) {
      var meta = METRIC_LABELS[key];
      var stats = state.data.stats[key];
      if (!stats) return;
      var cell = h('div', { class: 'metric-card' }, [
        h('div', { class: 'metric-label', text: meta.label })
      ]);
      var scaledCurrent = meta.scale === 100 ? stats.current * 100 : stats.current;
      var scaledGoal = stats.goal !== null && stats.goal !== undefined
        ? (meta.scale === 100 ? stats.goal * 100 : stats.goal) : null;
      cell.appendChild(h('div', { class: 'metric-values' }, [
        h('span', { class: 'metric-current', text: fmtNum(scaledCurrent, meta.decimals) + ' ' + meta.unit }),
        scaledGoal !== null ? h('span', { class: 'metric-goal', text: 'meta ' + fmtNum(scaledGoal, meta.decimals) }) : null
      ]));
      if (stats.progress !== null && stats.progress !== undefined) {
        cell.appendChild(h('div', { class: 'meter-track' }, [
          h('div', { class: 'meter-fill', style: 'width:' + stats.progress + '%;' })
        ]));
      }
      grid.appendChild(cell);
    });
    card.appendChild(grid);
    return card;
  }

  // --------------------------------------------------------------- chart

  var RANGE_OPTIONS = [
    { key: 30, label: '30 días' },
    { key: 90, label: '90 días' },
    { key: 180, label: '1 año' },
    { key: 'all', label: 'Todo' }
  ];

  function renderChartCard() {
    var card = h('div', { class: 'card' }, [
      h('div', { class: 'card-title', text: 'Evolución de peso' })
    ]);

    var rangeRow = h('div', { class: 'range-row' });
    RANGE_OPTIONS.forEach(function (opt) {
      rangeRow.appendChild(h('button', {
        class: 'range-chip' + (state.range === opt.key ? ' active' : ''),
        onClick: function () { state.range = opt.key; renderDashboard(); }
      }, [opt.label]));
    });
    card.appendChild(rangeRow);

    var chartWrap = h('div', { class: 'chart-wrap' });
    card.appendChild(chartWrap);

    var records = filteredRecords().filter(function (r) { return r.peso !== null; });
    if (!records.length) {
      chartWrap.appendChild(h('div', { class: 'chart-empty', text: 'No hay registros en este rango.' }));
    } else {
      buildLineChart(chartWrap, records, {
        goal: state.data.objetivo ? state.data.objetivo.peso : null,
        unit: 'kg',
        decimals: 1
      });
    }
    return card;
  }

  function buildLineChart(container, records, opts) {
    var width = Math.max(280, container.clientWidth || 320);
    var height = 220;
    var pad = { top: 18, right: 16, bottom: 24, left: 38 };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;

    var values = records.map(function (r) { return r.peso; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    if (opts.goal !== null && opts.goal !== undefined) {
      minV = Math.min(minV, opts.goal);
      maxV = Math.max(maxV, opts.goal);
    }
    if (minV === maxV) { minV -= 1; maxV += 1; }
    var vSpan = maxV - minV;
    minV -= vSpan * 0.12;
    maxV += vSpan * 0.12;
    vSpan = maxV - minV;

    var dates = records.map(function (r) { return new Date(r.date + 'T00:00:00').getTime(); });
    var minD = dates[0], maxD = dates[dates.length - 1];
    var dSpan = maxD - minD || 1;

    function xAt(i) { return pad.left + (records.length === 1 ? plotW / 2 : (dates[i] - minD) / dSpan * plotW); }
    function yAt(v) { return pad.top + plotH - (v - minV) / vSpan * plotH; }

    var root = svg('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, style: 'display:block;' });

    // gridlines + y ticks
    var tickCount = 4;
    for (var t = 0; t <= tickCount; t++) {
      var v = minV + (vSpan * t / tickCount);
      var y = yAt(v);
      root.appendChild(svg('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y, class: 'chart-gridline' }));
      var label = svg('text', { x: pad.left - 8, y: y + 3, 'text-anchor': 'end', class: 'tick-label' });
      label.textContent = fmtNum(v, opts.decimals);
      root.appendChild(label);
    }

    // goal reference line
    if (opts.goal !== null && opts.goal !== undefined) {
      var gy = yAt(opts.goal);
      var goalLine = svg('line', {
        x1: pad.left, x2: width - pad.right, y1: gy, y2: gy,
        stroke: 'var(--baseline)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4'
      });
      root.appendChild(goalLine);
      var goalLabel = svg('text', { x: width - pad.right, y: gy - 5, 'text-anchor': 'end', class: 'goal-label' });
      goalLabel.textContent = 'Objetivo ' + fmtNum(opts.goal, opts.decimals);
      root.appendChild(goalLabel);
    }

    // line path
    var d = records.map(function (r, i) { return (i === 0 ? 'M' : 'L') + xAt(i) + ',' + yAt(r.peso); }).join(' ');
    root.appendChild(svg('path', { d: d, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

    // dots
    var dotGroup = svg('g');
    records.forEach(function (r, i) {
      var dot = svg('circle', { cx: xAt(i), cy: yAt(r.peso), r: 4, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2 });
      dotGroup.appendChild(dot);
    });
    root.appendChild(dotGroup);

    // x ticks (first, middle, last)
    [0, Math.floor((records.length - 1) / 2), records.length - 1].forEach(function (i, idx) {
      if (idx === 1 && records.length < 5) return;
      var label = svg('text', { x: xAt(i), y: height - 6, 'text-anchor': idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle', class: 'tick-label' });
      label.textContent = fmtShortDate(records[i].date);
      root.appendChild(label);
    });

    // hover layer
    var crosshair = svg('line', { x1: 0, x2: 0, y1: pad.top, y2: pad.top + plotH, class: 'crosshair-line', opacity: 0 });
    root.appendChild(crosshair);
    var hoverDot = svg('circle', { r: 6, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2, opacity: 0 });
    root.appendChild(hoverDot);

    var hitRect = svg('rect', { x: pad.left, y: 0, width: plotW, height: height, fill: 'transparent' });
    root.appendChild(hitRect);

    var tooltip = h('div', { class: 'tooltip' }, [
      h('div', { class: 'tooltip-date' }),
      h('div', { class: 'tooltip-value' })
    ]);

    container.innerHTML = '';
    container.style.position = 'relative';
    container.appendChild(root);
    container.appendChild(tooltip);

    function pointerMove(evt) {
      var rect = root.getBoundingClientRect();
      var scaleX = width / rect.width;
      var px = (evt.clientX - rect.left) * scaleX;
      var closest = 0, best = Infinity;
      for (var i = 0; i < records.length; i++) {
        var dist = Math.abs(xAt(i) - px);
        if (dist < best) { best = dist; closest = i; }
      }
      var cx = xAt(closest), cy = yAt(records[closest].peso);
      crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx);
      crosshair.setAttribute('opacity', 1);
      hoverDot.setAttribute('cx', cx); hoverDot.setAttribute('cy', cy);
      hoverDot.setAttribute('opacity', 1);

      tooltip.querySelector('.tooltip-date').textContent = fmtFullDate(records[closest].date);
      tooltip.querySelector('.tooltip-value').textContent = fmtNum(records[closest].peso, opts.decimals) + ' ' + opts.unit;
      tooltip.classList.add('visible');
      var tRect = root.getBoundingClientRect();
      tooltip.style.left = (cx / width * tRect.width) + 'px';
      tooltip.style.top = (cy / height * tRect.height) + 'px';
    }
    function pointerLeave() {
      crosshair.setAttribute('opacity', 0);
      hoverDot.setAttribute('opacity', 0);
      tooltip.classList.remove('visible');
    }
    hitRect.addEventListener('pointermove', pointerMove);
    hitRect.addEventListener('pointerleave', pointerLeave);
  }

  function renderSparkline(values) {
    values = (values || []).filter(function (v) { return v !== null && v !== undefined; });
    var width = 72, height = 28;
    if (values.length < 2) return h('div', { class: 'sparkline' });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = max - min || 1;
    var root = svg('svg', { width: width, height: height, class: 'sparkline' });
    var d = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * width;
      var y = height - 4 - ((v - min) / span) * (height - 8);
      return (i === 0 ? 'M' : 'L') + x + ',' + y;
    }).join(' ');
    root.appendChild(svg('path', { d: d, fill: 'none', stroke: 'var(--text-muted)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return root;
  }

  // ------------------------------------------------------------- history

  function renderHistoryCard() {
    var card = h('div', { class: 'card' }, [
      h('div', { class: 'card-title', text: 'Últimos registros' })
    ]);
    var records = state.data.records.slice().reverse().slice(0, 8);
    records.forEach(function (r) {
      card.appendChild(h('div', { class: 'history-row' }, [
        h('span', { class: 'history-date', text: fmtFullDate(r.date) }),
        h('span', { class: 'history-value', text: fmtNum(r.peso, 1) + ' kg' })
      ]));
    });
    return card;
  }

  // --------------------------------------------------------------- modal

  function openAddModal() {
    var profile = state.data.profile;
    var backdrop = h('div', { class: 'modal-backdrop', onClick: function (e) { if (e.target === backdrop) closeModal(); } });
    var modal = h('div', { class: 'modal' });
    backdrop.appendChild(modal);

    modal.appendChild(h('div', { class: 'modal-title', text: 'Nuevo registro · ' + profile.name }));

    var form = h('form', {});
    var fields = {};

    function field(key, label, type, opts) {
      opts = opts || {};
      var input = h('input', Object.assign({ type: type, name: key }, opts));
      fields[key] = input;
      form.appendChild(h('div', { class: 'field' }, [
        h('label', { text: label }),
        input
      ]));
    }

    field('date', 'Fecha', 'date', { value: todayLocalISO(), required: 'required' });

    var resultBox = null;
    if (profile.weighMethod === 'holding') {
      field('ownWeight', 'Tu peso solo/a (kg)', 'number', { step: '0.1', min: '0', required: 'required', placeholder: 'Ej: 78.2' });
      field('withPetWeight', 'Tu peso con ' + profile.name + ' en brazos (kg)', 'number', { step: '0.1', min: '0', required: 'required', placeholder: 'Ej: 82.1' });
      resultBox = h('div', { class: 'field-result' });
      form.appendChild(resultBox);
      var updateResult = function () {
        var own = parseFloat(fields.ownWeight.value);
        var withPet = parseFloat(fields.withPetWeight.value);
        if (isNaN(own) || isNaN(withPet)) { resultBox.textContent = ''; resultBox.classList.remove('warn'); return; }
        var diff = withPet - own;
        if (diff > 0) {
          resultBox.textContent = 'Peso de ' + profile.name + ': ' + fmtNum(diff, 2) + ' kg';
          resultBox.classList.remove('warn');
        } else {
          resultBox.textContent = 'Revisá los valores: tu peso con ' + profile.name + ' debería ser mayor que tu peso solo/a.';
          resultBox.classList.add('warn');
        }
      };
      fields.ownWeight.addEventListener('input', updateResult);
      fields.withPetWeight.addEventListener('input', updateResult);
    } else {
      field('peso', 'Peso (kg)', 'number', { step: '0.1', min: '0', required: 'required', placeholder: 'Ej: 89.5' });
    }

    if (profile.dataType === 'full') {
      field('grasa', '% grasa corporal', 'number', { step: '0.1', min: '0', max: '100', placeholder: 'Ej: 24.5' });
      field('masaMagra', 'Masa magra (kg)', 'number', { step: '0.1', min: '0', placeholder: 'Opcional' });
      field('edad', 'Edad metabólica', 'number', { step: '1', min: '0', placeholder: 'Opcional' });
      field('grasaVisceral', 'Grasa visceral', 'number', { step: '0.1', min: '0', placeholder: 'Opcional' });
    }

    var errorBox = h('div', { class: 'form-error', style: 'display:none;' });
    form.appendChild(errorBox);

    var saveBtn = h('button', { type: 'submit', class: 'btn-primary' }, ['Guardar']);
    form.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { type: 'button', class: 'btn-secondary', onClick: closeModal }, ['Cancelar']),
      saveBtn
    ]));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.style.display = 'none';
      var payload = {};
      Object.keys(fields).forEach(function (key) { payload[key] = fields[key].value; });

      if (profile.weighMethod === 'holding') {
        var own = parseFloat(payload.ownWeight);
        var withPet = parseFloat(payload.withPetWeight);
        if (!payload.date || isNaN(own) || isNaN(withPet)) {
          errorBox.textContent = 'Completá la fecha y los dos pesos.';
          errorBox.style.display = 'block';
          return;
        }
        var diff = withPet - own;
        if (diff <= 0) {
          errorBox.textContent = 'Tu peso con ' + profile.name + ' debería ser mayor a tu peso solo/a. Revisá los valores.';
          errorBox.style.display = 'block';
          return;
        }
        payload = { date: payload.date, peso: diff.toFixed(2) };
      } else if (!payload.date || !payload.peso) {
        errorBox.textContent = 'Completá al menos la fecha y el peso.';
        errorBox.style.display = 'block';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      apiPost('addRecord', { profileKey: state.profileKey, data: payload }).then(function (data) {
        state.data = data;
        closeModal();
        renderDashboard();
        showToast('Registro guardado ✓');
      }).catch(function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
        errorBox.textContent = err && err.message ? err.message : 'No se pudo guardar el registro.';
        errorBox.style.display = 'block';
      });
    });

    modal.appendChild(form);
    document.body.appendChild(backdrop);

    function closeModal() { backdrop.remove(); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
