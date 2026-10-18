// =====================================================================
// Gemini: lectura de imágenes y documentos para Notes, Garaje y Economía
// ---------------------------------------------------------------------
// La clave va en Propiedades del script como GEMINI_API_KEY; nunca llega
// al navegador. El modelo es fijo. Si Gemini falla, cada sección usa su
// lector de antes (Tesseract en el móvil o el OCR de Drive).
// =====================================================================

const GEMINI_MODELO = 'gemini-3.8-flash';

// Reglas de transcripción comunes (las del Transcriptor Gemini, en modo automático).
// limpia = true: une las líneas de un párrafo (Notes). false: respeta los saltos de línea.
function reglasTranscripcion_(limpia) {
  return [
    'La imagen puede contener texto impreso, manuscrito o ambos (por ejemplo, anotaciones a mano sobre un documento impreso). Transcríbelo todo.',
    'Reglas:',
    '- Mantén el idioma original del texto; no lo traduzcas.',
    '- No resumas, no expliques y no añadas nada: transcribe solo el texto.',
    '- Si una palabra es ilegible, escribe [ilegible]. Si dudas entre opciones, escribe la más probable seguida de [?].',
    '- Si hay anotaciones manuscritas en el margen o sobre texto impreso, indícalas entre corchetes: [nota a mano: ...].',
    '- Si hay tablas, reprodúcelas en formato de tabla Markdown.',
    limpia
      ? '- Une las líneas de un mismo párrafo, elimina los guiones de corte de palabra y conserva la separación entre párrafos. No corrijas la ortografía.'
      : '- Respeta los saltos de línea, la ortografía y la puntuación originales, aunque haya errores.',
  ].join('\n');
}

// Transcripción en texto plano (Notes).
function geminiTexto_(archivos) {
  const prompt = 'Eres un sistema de transcripción de documentos. Transcribe TODO el texto visible en la imagen.\n' +
    reglasTranscripcion_(true) + '\nDevuelve solo el texto transcrito.';
  return geminiLlamar_(prompt, archivos, false).trim();
}

// Lectura con datos estructurados (Garaje, Economía): devuelve el objeto JSON.
function geminiJson_(prompt, archivos) {
  const texto = geminiLlamar_(prompt, archivos, true);
  try {
    return JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    throw new Error('Gemini no ha devuelto datos válidos');
  }
}

// archivos: [{ mime, data }] con data en base64 (imágenes o PDF).
function geminiLlamar_(prompt, archivos, json) {
  const clave = (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '').trim();
  if (!clave) throw error_('Falta la propiedad GEMINI_API_KEY en las propiedades del script Casa.', 'gemini');
  const lista = (archivos || []).filter(function (a) { return a && a.data; }).slice(0, 4);
  if (!lista.length) throw error_('No hay ninguna imagen que leer', 'datos');

  const cuerpo = {
    contents: [{
      parts: [{ text: prompt }].concat(lista.map(function (a) {
        return { inline_data: { mime_type: a.mime || 'image/jpeg', data: a.data } };
      })),
    }],
    generationConfig: { temperature: 0 },
  };
  if (json) cuerpo.generationConfig.responseMimeType = 'application/json';

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODELO) + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': clave },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true,
    }
  );
  let datos = {};
  try { datos = JSON.parse(res.getContentText()); } catch (e) { /* respuesta no JSON */ }
  if (res.getResponseCode() >= 300) {
    throw error_('Gemini: ' + ((datos.error && datos.error.message) || 'HTTP ' + res.getResponseCode()), 'gemini');
  }
  const cand = (datos.candidates || [])[0] || {};
  const texto = ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('');
  if (!texto.trim()) throw error_('Gemini ha devuelto una respuesta vacía (' + (cand.finishReason || 'sin motivo') + ')', 'gemini');
  return texto;
}

// ---------- Utilidades para validar lo que devuelve Gemini ----------
function geminiFecha_(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}

function geminiNumero_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 121.500 (miles)
  const n = Number(s);
  return s && isFinite(n) ? n : null;
}

function geminiTextoCorto_(v, max) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
}
