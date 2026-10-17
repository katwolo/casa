# 🚗 Garatge · Els meus vehicles

Seguimiento de vehículos (mantenimientos, reparaciones, ITV, seguro, facturas…).

- **Frontend:** `index.html` → publicado en GitHub Pages.
- **Backend:** `apps-script/` → Google Apps Script (Google Sheets como base de datos y Drive para las facturas).

```
index.html               ← la app (GitHub Pages)
apps-script/Codigo.gs    ← API en Apps Script (doPost)
apps-script/appsscript.json
```

## 1. Apps Script (backend)

1. Abre tu proyecto **Garatge** en script.google.com.
2. Sustituye el contenido de `Código.gs` por el de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Borra el archivo `Index` del proyecto (la interfaz ahora vive en GitHub).
4. **Clave de acceso** (recomendado): ⚙️ *Configuración del proyecto* → *Propiedades del script* → añade
   `CLAU` = la clave que quieras. Sin ella, cualquiera con la URL podría leer/modificar los datos.
5. *Implementar* → *Gestionar implementaciones* → ✏️ editar la implementación existente →
   *Versión: Nueva versión* → *Implementar*. (Así se mantiene la misma URL `/exec`.)
   - Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier persona**.
   - Si no tenías implementación: *Nueva implementación* → tipo *Aplicación web*.
6. Copia la URL que acaba en `/exec`.
7. **Permisos para leer facturas (OCR):** en el editor, elige la función `autoritzar` y pulsa ▶ *Ejecutar*.
   Acepta los permisos (Drive y "conectarse a un servicio externo"). Hazlo **antes** del paso 5 o vuelve
   a publicar una *Nueva versión* después.
   - Si da *"Se ha producido un error desconocido"*: hazlo desde un **ordenador** (no desde el móvil), en una
     **ventana de incógnito** donde solo hayas iniciado sesión con la cuenta propietaria del script, y permite
     las ventanas emergentes de script.google.com.

## 2. GitHub Pages (frontend)

1. En GitHub: *Settings* → *Pages* → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)`.
2. La app quedará en: **https://katwolo.github.io/garatge/**
3. La URL del Apps Script ya está integrada (`GAS_URL_PER_DEFECTE` en `index.html`). Si has puesto `CLAU`,
   la app te pedirá la clave la primera vez (⚙️); se guarda en el navegador. Si cambias de implementación
   (URL nueva), actualiza `GAS_URL_PER_DEFECTE`.

## Lectura automática de facturas

Al hacer una foto o adjuntar un PDF en un **registro nuevo**, la app lee la factura sola y rellena los campos
(se marcan en amarillo para que los revises). En registros ya existentes, pulsa **✨ Llegir dades de la factura**.

- El Apps Script usa el **OCR de Google Drive** (gratis, sin claves): convierte la imagen en un Documento temporal,
  saca el texto y lo borra.
- La app busca en ese texto: **fecha**, **km**, **total** (la cifra mayor de las líneas "Total", sin base ni IVA),
  **matrícula** (para elegir el vehículo), **taller** (cabecera), **tipo** y **qué se ha hecho** (palabras clave:
  aceite, filtros, frenos, neumáticos, ITV, póliza…), y "próxima revisión/vencimiento" → *Propera revisió*.
- Es por patrones, así que no es infalible: revisa siempre antes de guardar. Funciona mejor con fotos rectas,
  bien iluminadas y con PDFs originales.

## Cómo funciona la conexión

`index.html` hace `fetch(POST)` a la URL `/exec` con `{ clau, fn, args }` y el Apps Script responde
`{ ok, data | error }`. Funciones disponibles: `getData`, `saveVehicle`, `deleteVehicle`,
`saveRecord`, `deleteRecord`, `getFitxer`, `llegirFactura`.
