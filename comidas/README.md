# Menú de casa — GitHub Pages + Google Sheets

La app se sirve desde una URL de GitHub Pages, pero los datos (recetas, planificación, lista de la compra) siguen viviendo en tu Google Sheet, igual que antes.

## Cómo funciona ahora

`Code.gs` actúa como una pequeña API (recibe peticiones HTTP normales) y `index.html` le habla por `fetch()`, que funciona desde cualquier dominio, incluido GitHub Pages y la propia URL `.../exec` de Apps Script.

- `Code.gs` — mismas funciones de siempre (`getRecipes`, `saveRecipe`, etc.) + un enrutador (`doGet`/`doPost`) que las expone como API.
- `index.html` (minúsculas) — la app completa. La sirve GitHub Pages, y también Apps Script si abres la URL `.../exec` directamente sin `?action=` (útil para probar). GitHub Pages es sensible a mayúsculas/minúsculas y solo reconoce `index.html` como página de inicio, así que solo hay un archivo — nada que mantener sincronizado.
- `appsscript.json` — el acceso ahora es **`ANYONE`** (antes estaba en `MYSELF`). Es imprescindible: si lo dejas en `MYSELF`, GitHub Pages no podrá llamar a la API porque solo tú (con tu sesión de Google) tendrías permiso.
- **Caché local**: la app guarda una copia de las recetas y de las últimas semanas visitadas en el `localStorage` del propio móvil/navegador. Al abrir la app, renderiza al instante con esa copia mientras sincroniza con la Sheet en segundo plano — así la carga inicial no depende de lo rápido (o lento) que responda Apps Script. Si el dispositivo no tiene nada en caché todavía (primera vez), sí espera a la respuesta de red, mostrando la pantalla de carga con un botón "Reintentar" si falla.

## 1. Desplegar Code.gs como API (igual que antes, con un ajuste)

```bash
clasp push
```

En script.google.com: **Implementar → Gestionar implementaciones → ✎ → Nueva versión → Implementar**.

Al desplegar, revisa estas dos opciones (o vuelve a crear la implementación si ya existía con otras):
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier persona**

⚠️ "Cualquier persona" significa que cualquiera con la URL `.../exec` puede llamar a tu API y leer/escribir en la Sheet — no hay contraseña. La URL es larga y no adivinable, así que es razonablemente privada, pero no es una autenticación real. Si esto te preocupa, dímelo y añadimos una clave simple (un token en la URL que Code.gs valide) antes de compartir la URL de GitHub Pages con nadie fuera de casa.

Copia la URL `.../exec` que te da el diálogo.

## 2. Configurar la URL de la API

La URL `.../exec` **ya no se edita en el código**: se configura desde la propia app, en Ajustes (el icono ⚙️ arriba a la derecha del encabezado) → pega la URL en el campo → "Probar conexión" para confirmar que responde → "Guardar". Se guarda en el `localStorage` de ese dispositivo, así que cada persona que use la app la configura una vez en su móvil/navegador.

El código incluye una URL por defecto (`DEFAULT_GS_URL`, cerca del principio del `<script>` en `index.html`) para que la app funcione sin configuración adicional en un dispositivo nuevo. Si rehaces el despliegue de Apps Script y te da una URL distinta, puedes actualizar ese valor por defecto en el código, o simplemente decirle a cada persona que actualice la URL desde Ajustes — no hace falta redesplegar nada para lo segundo.

## 3. Subir a GitHub y activar Pages

```bash
git add .
git commit -m "Frontend servido desde GitHub Pages, backend API en Apps Script"
git push
```

En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.

En 1-2 minutos tendrás tu URL, del tipo:
`https://TU-USUARIO.github.io/TU-REPO/`

Esa es la URL para el día a día. `index.html` en la raíz se sirve automáticamente.

## Notas

- Los dos adultos comparten los mismos datos (misma Sheet), abran la app desde donde la abran.
- Si la app muestra "No se ha podido conectar con la hoja de cálculo", casi siempre es una de estas causas: (a) la URL en Ajustes no está bien pegada o no termina en `/exec`, (b) el despliegue de Apps Script no tiene el acceso en "Cualquier persona", o (c) un hipo puntual de Apps Script — el botón "Reintentar" suele bastar.
- Con la caché local, si ves datos desactualizados justo al abrir la app y luego "cambian solos" a los pocos segundos, es normal: es la sincronización en segundo plano actualizando lo que había en caché con lo último de la Sheet.
