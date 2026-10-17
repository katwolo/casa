// Conexión con el script Casa: configuración, llamadas y borrados pendientes.
// La URL y la clave vienen de Casa > Ajustes (comun/casa.js, cargado antes que este módulo).
// Estado propio de esta copia (última sincronización, último error); no se usa
// 'economia.sync', que es de la web original y guarda su clave.
const CFG_KEY = 'casa.economia.sync';
const TOMB_KEY = 'economia.tombstones';

function readJson(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

// Ya no hay URL propia: con un valor aquí la app no pide la URL en Ajustes.
export const DEFAULT_URL = 'casa';

// Permiso de este dispositivo: 'editar', 'ver', 'ninguno' o null (sin conectar).
export const permiso = () => window.Casa.permiso('economia');

export const getConfig = () => readJson(CFG_KEY, {});
export const setConfig = (patch) => writeJson(CFG_KEY, { ...getConfig(), ...patch });
export const isConfigured = () => {
  const c = window.Casa.conexion();
  return Boolean(c.url && c.clave);
};

export async function api(action, payload = {}) {
  if (action === 'upload' && permiso() === 'ver') throw new Error('Solo puedes ver Economía, no modificarla.');
  const j = await window.Casa.llamar('economia', action, payload);
  return { ok: true, ...j.datos };
}

// Borrados que aún hay que comunicar a la hoja.
export const getTombstones = () => readJson(TOMB_KEY, []);
export function addTombstone(kind, id) {
  writeJson(TOMB_KEY, [...getTombstones().filter((t) => t.id !== id), { kind, id, deleted: true, updatedAt: Date.now() }]);
}
export function clearTombstones(sent) {
  const ids = new Set(sent.map((t) => t.id));
  writeJson(TOMB_KEY, getTombstones().filter((t) => !ids.has(t.id)));
}
export const resetTombstones = () => writeJson(TOMB_KEY, []);
