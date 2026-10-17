# Registro de Peso

App web para registrar y visualizar el peso de Iván, Isa, Yami, Yoshi y
Spike. La base de datos es la Google Sheet:

`1ZYoBPSLDR3CuYrv_6bkFDoMCLxjlAIkqIYYCn8sP4JI`

## Arquitectura

Dos partes separadas:

- **`backend/`** — Google Apps Script. Solo expone una API JSON
  (`doGet`/`doPost`) que lee y escribe sobre la Sheet. No sirve HTML.
- **Raíz del repo** (`index.html`, `styles.css`, `app.js`) — el frontend,
  un sitio estático sin frameworks pensado para **GitHub Pages**. Le pide
  los datos a la API por `fetch`.

Cada perfil tiene un dashboard con: peso actual, cambio en los últimos
7/30 días, progreso hacia el objetivo (peso, % grasa corporal, masa magra,
edad metabólica y grasa visceral para Iván e Isa), un gráfico de evolución
con línea de objetivo, y el historial de registros. El botón
"+ Nuevo registro" carga mediciones nuevas sin tocar la planilla a mano.

## 1. Desplegar el backend (Apps Script)

Requiere tu cuenta de Google.

1. Andá a https://script.google.com/ → **Nuevo proyecto**.
2. Borrá el `Code.gs` vacío y pegá el contenido de `backend/Code.gs`.
3. Activá el manifiesto (**Configuración del proyecto** → "Mostrar archivo
   de manifiesto `appsscript.json`") y reemplazá su contenido por el de
   `backend/appsscript.json`.
4. **Implementar → Nueva implementación → tipo: Aplicación web.**
   - Ejecutar como: **Yo (tu cuenta)**.
   - Quién tiene acceso: ver la nota de privacidad más abajo.
5. Autorizá los permisos la primera vez (acceso a la Sheet).
6. Copiá la URL `.../exec` que te da — es la API.

Si más adelante cambiás algo en `backend/Code.gs`, para que la misma URL
`/exec` sirva la versión nueva tenés que ir a **Gestionar implementaciones
→ editar (lápiz) → Versión: Nueva versión → Implementar**. Guardar el
archivo solo no alcanza.

Alternativa con `clasp` (CLI): `cd backend && clasp login && clasp create
--type webapp --title "Registro de Peso API" --rootDir . && clasp push &&
clasp deploy`.

## 2. Conectar el frontend a esa API

En `app.js`, la primera línea útil define:

```js
var API_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
```

Reemplazá esa URL por la que te dio tu implementación del paso 1 (si
recién desplegaste, ya está puesta la URL que me pasaste; solo hace falta
tocarla si el día de mañana creás una implementación nueva en vez de
actualizar la existente).

## 3. Publicar el frontend en GitHub Pages

1. En GitHub: **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: la rama de este repo, carpeta **/ (root)** → **Save**.
4. Esperá 1-2 minutos. Va a quedar en `https://<usuario>.github.io/<repo>/`.

## Cómo funciona el fetch cross-origin (CORS)

El frontend vive en `github.io` y la API en `script.google.com` — son
orígenes distintos, así que:

- Las lecturas (`GET`) van con los parámetros en la URL (`?action=data&
  profile=ivan`) — son "simple requests", sin problema de CORS.
- Las escrituras (`POST`, para "+ Nuevo registro") mandan el body como
  `Content-Type: text/plain` en vez de `application/json`. Es intencional:
  así el pedido también queda como "simple request" y el navegador no
  dispara un preflight `OPTIONS`, que Apps Script no puede responder con
  los headers que un preflight cross-origin necesita. El backend
  (`doPost`) igual parsea ese texto como JSON.

Si en algún momento `fetch` falla con un error de CORS en la consola del
navegador, es la primera pista a mirar (revisar Network → la respuesta de
`script.google.com`), y decime el mensaje exacto para ajustarlo.

## Nota de privacidad importante

El manifest (`backend/appsscript.json`) trae `"access": "ANYONE_ANONYMOUS"`:
cualquiera con la URL de la API (o el link de GitHub Pages) puede ver y
cargar registros **sin iniciar sesión**, tal como se pidió — sin pantalla
de login en la app. Ni la URL de Apps Script ni la de GitHub Pages están
indexadas, pero eso no es una barrera de seguridad real si el link se
filtra.

Si preferís requerir una cuenta de Google, cambiá en
`backend/appsscript.json`:

```json
"access": "ANYONE"
```

y volvé a desplegar. Con eso cualquier cuenta de Google puede usar la API
(sin agregar ninguna pantalla de login dentro del frontend — Google se
encarga antes de responder); `DOMAIN` solo sirve con Google Workspace, no
con cuentas @gmail.com sueltas.

## Estructura de la Sheet que usa la API

- **`_Perfiles`**: pestaña de configuración, creada sola la primera vez que
  corre esta versión del backend. Guarda la lista de perfiles (columnas
  `key, sheetName, name, dataType, category, icon, weighMethod`) — es lo
  que lee/escribe el botón ⚙️ de la app. No hace falta tocarla a mano.
- **Iván / Isa** (`dataType: 'full'`): fila 1 = objetivo (`Peso, %grasa,
  Masa magra, Edad, Grasa visceral`), fila 2 = encabezados, fila 3 en
  adelante = datos.
- **Ilian / Idris / Yami / Yoshi / Spike** (`dataType: 'simple'`): solo
  `Fecha, Peso`, sin encabezado, desde la fila 1.

La API respeta esa estructura tal cual está en tu planilla — no la
modifica ni le agrega columnas. Los nuevos registros se agregan al final
de cada hoja.

## Cómo agregar, editar o borrar un perfil

Desde la app: tocá el ⚙️ arriba a la derecha de la pantalla de selección
de perfiles.

- **Crear**: nombre, tipo ("Persona" con las 5 métricas y objetivos, o
  "Solo peso" para bebés/mascotas), categoría (el texto de la tarjeta),
  ícono (tipeando un emoji o eligiendo uno de la grilla), y si se pesa en
  brazos restando tu peso. Crea sola la hoja nueva en la Sheet con la
  estructura que corresponda.
- **Editar**: nombre (renombra también la hoja), categoría, ícono, si se
  pesa en brazos, y los valores de objetivo (para perfiles "Persona"). El
  tipo no se puede cambiar una vez creado el perfil — cambiar la
  estructura de una hoja con datos ya cargados es más riesgoso que vale
  la pena automatizar.
- **Borrar**: saca el perfil de la app. **No borra la hoja ni su
  historial** en la planilla — si te arrepentís, se recupera agregando
  el perfil de nuevo con el mismo nombre exacto de hoja.

Como esto toca `backend/Code.gs`, después de esta actualización hace
falta pegar el archivo en tu proyecto de Apps Script y volver a
implementar (*Gestionar implementaciones → editar → Nueva versión →
Implementar*) una vez. Después de eso, crear/editar/borrar perfiles ya
no requiere tocar código nunca más.
