# Script Casa

Un único proyecto de Apps Script para todas las secciones de Casa. Controla quién entra (tú o tu pareja) y qué puede hacer cada uno en cada sección. Las seis secciones (Comidas, Botiquín, Garaje, Pesos, Economía y Notes) ya están migradas.

## Archivos

| Archivo | Qué hace |
|---|---|
| `Codigo.gs` | Recibe las peticiones y las envía a la sección correspondiente. |
| `acceso.gs` | Claves, permisos de la pareja y registro de intentos fallidos. |
| `comidas.gs` | Sección Comidas: recetas, menú semanal y lista de la compra. |
| `botiquin.gs` | Sección Botiquín: medicamentos, tratamientos y dosis. |
| `pesos.gs` | Sección Pesos: perfiles y registros de peso. |
| `garaje.gs` | Sección Garaje: vehículos, registros y facturas en Drive (con lectura OCR). |
| `economia.gs` | Sección Economía: movimientos, gastos fijos, presupuestos, objetivos y tickets en Drive. |
| `notes.gs` | Sección Notes: notas, tareas, eventos, libretas, y fotos y grabaciones en Drive. |
| `gemini.gs` | Lectura de fotos y documentos con Gemini (modelo `gemini-3.8-flash`) para Notes, Garaje y Economía. |
| `appsscript.json` | Configuración del proyecto (zona horaria y publicación como app web). |

## Instalación (una sola vez)

1. Entra en <https://script.google.com> y crea un **proyecto nuevo**. Llámalo `Casa`.
2. Copia el contenido de `Codigo.gs` en el archivo `Código.gs` del proyecto.
3. Crea un archivo nuevo de script (`+` → Secuencia de comandos) llamado `acceso` y pega `acceso.gs`.
4. En **Configuración del proyecto** (⚙️), activa *Mostrar el archivo de manifiesto "appsscript.json"*, vuelve al editor y sustituye su contenido por el de `appsscript.json`.
5. En **Configuración del proyecto → Propiedades del script**, añade:
   - `CLAVE_ADMIN` = tu clave. Usa una larga que no uses en ningún otro sitio.
6. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   
   Autoriza los permisos que te pida (enviar correos para los avisos) y copia la URL que acaba en `/exec`.
7. Abre **Casa → ⚙️ Ajustes**, pega la URL y tu clave, y pulsa **Conectar**.

Si quieres no tener que pegar la URL en cada dispositivo, ponla también en `comun/casa.js`, en `URL_POR_DEFECTO`.

## Propiedades del script

| Propiedad | Quién la pone | Para qué |
|---|---|---|
| `CLAVE_ADMIN` | Tú, a mano | Tu clave. Acceso total. |
| `COMIDAS_SPREADSHEET_ID` | Tú, a mano | ID de la Google Sheet de Comidas (la misma que usa si_chef). |
| `BOTIQUIN_SPREADSHEET_ID` | Tú, a mano | ID de la Google Sheet del botiquín (la misma que usa MediHome). |
| `PESOS_SPREADSHEET_ID` | Tú, a mano | ID de la Google Sheet de pesos (la misma que usa registro-peso). |
| `GARAJE_SS_ID` | Tú, a mano | ID de la hoja «Garatge · Base de dades» (`SS_ID` en el script original de garatge). |
| `GARAJE_ROOT_ID` | Tú, a mano | ID de la carpeta de Drive «Garatge · Vehicles» (`ROOT_ID` en el script original de garatge). |
| `ECONOMIA_SPREADSHEET_ID` | Tú, a mano | ID de la Google Sheet de economía. |
| `ECONOMIA_FOLDER_ID` | Tú, a mano | ID de la carpeta de tickets «Economía familiar - tickets» (`FOLDER_ID` en el script original). |
| `NOTES_SPREADSHEET_ID` | Tú, a mano | ID de la Google Sheet de Notes (la del repositorio diario). |
| `NOTES_FOLDER_ID` | Tú, a mano | ID de la carpeta de fotos y grabaciones de Notes (`FOLDER_ID` en el código original: `1MSY4B9YGGNCExrQkpKkp7rWHCIaRtD_y`). |
| `GEMINI_API_KEY` | Tú, a mano | Tu clave de la API de Gemini. Si falta o Gemini falla, cada sección usa su lector de antes. |
| `CLAVE_PAREJA` | Ajustes | Clave de tu pareja. Se crea, cambia o quita desde Ajustes. |
| `PERMISOS_PAREJA` | Ajustes | Ninguno / ver / editar en cada sección. |
| `AVISO_EMAIL` | Ajustes | `si` para recibir un correo si alguien usa una clave incorrecta (como mucho uno por hora). |
| `REGISTRO_FALLOS` | El script | Los últimos 50 intentos con clave incorrecta. |

## Al actualizar el código

Pega los archivos nuevos y haz **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**. Así la URL no cambia. Las claves y los permisos no se tocan, porque están en las propiedades.

## Secciones migradas

| Sección | Archivo | Propiedad con la hoja | Notas |
|---|---|---|---|
| Comidas | `comidas.gs` | `COMIDAS_SPREADSHEET_ID` | Usa la misma hoja que la web original si_chef. La caché de Casa dura 5 minutos, por si alguien edita la hoja directamente o desde el script antiguo. |
| Botiquín | `botiquin.gs` | `BOTIQUIN_SPREADSHEET_ID` | Usa la misma hoja que la web original MediHome (pestañas Medicaments, Tractaments y Dosis). |
| Pesos | `pesos.gs` | `PESOS_SPREADSHEET_ID` | Usa la misma hoja que la web original registro-peso. Las fechas se leen y escriben en la zona horaria de la propia hoja, para que no cambien de día. |
| Garaje | `garaje.gs` | `GARAJE_SS_ID` y `GARAJE_ROOT_ID` | Usa la misma hoja y la misma carpeta de facturas que la web original garatge. A diferencia del original, no crea nada si faltan los IDs: muestra un error. Necesita los permisos de Drive y de conexiones externas (para leer facturas). |
| Economía | `economia.gs` | `ECONOMIA_SPREADSHEET_ID` y `ECONOMIA_FOLDER_ID` | Usa la misma hoja y la misma carpeta de tickets que la web original. No crea nada si faltan los IDs. Con permiso de solo ver, la sincronización devuelve los datos pero ignora lo que envía el móvil. **El script original debe seguir dentro de la hoja**: su función `onEdit` marca las filas que editas a mano para que lleguen a la app, y eso solo funciona desde un script que vive en la hoja. |
| Notes | `notes.gs` | `NOTES_SPREADSHEET_ID` y `NOTES_FOLDER_ID` | Igual que Economía: misma hoja y misma carpeta, con solo ver se ignora lo que envía el móvil, y **el script original debe seguir dentro de la hoja** por su función `onEdit`. |

Para añadir una sección: crea su archivo `.gs` en el proyecto, añade su propiedad con el ID de la hoja y publica una **nueva versión**. La primera vez que una sección use un servicio nuevo de Google (Sheets, Drive…), el editor te pedirá autorizarlo.

## Al cambiar los archivos de la web

Los navegadores guardan una copia de `comun/casa.js`, `comun/estilo.css` y `ajustes/ajustes.js` durante un rato. Por eso las páginas los cargan con un número de versión (`casa.js?v=4`). Cada vez que cambie alguno de esos archivos, se sube ese número en todas las páginas, para que el navegador descargue la versión nueva.

## Si sale un error de permisos («No tienes permiso para llamar a…»)

1. Comprueba que `appsscript.json` del proyecto tiene la lista `oauthScopes` de este repositorio. Si una sección nueva necesita otro servicio de Google (por ejemplo Drive), se añade ahí.
2. En el editor, elige la función `autorizar` en el desplegable de arriba y pulsa **▶ Ejecutar**. Acepta la ventana de permisos de Google. En el registro verás si puede abrir cada hoja.
3. Publica una **nueva versión** de la implementación.

## Lectura con Gemini

Notes, Garaje y Economía leen las fotos y los documentos con Gemini a través de este script (`gemini.gs`), con la clave `GEMINI_API_KEY` y el modelo `gemini-3.8-flash` fijo en el código. La clave nunca llega al navegador.

| Sección | Qué hace Gemini | Si Gemini falla o no hay conexión |
|---|---|---|
| Notes | Transcribe la foto (impreso o a mano) y la añade a la nota. | Tesseract en el móvil, como antes. |
| Garaje | Transcribe la factura y rellena vehículo, tipo, qué se ha hecho, fecha, km, coste, taller, notas y próxima revisión. Lo que no encuentre se completa con la lectura de siempre del texto. | OCR de Google Drive, como antes. |
| Economía | Lee tickets y extractos (fotos y PDF escaneados): en un ticket rellena fecha, comercio, importe y categoría; en un extracto, la lista de movimientos. Las categorías que la app ya ha aprendido mandan sobre la de Gemini. | Tesseract en el móvil, como antes. |

Con permiso de solo ver, nadie puede usar Gemini (no puede añadir ni cambiar nada).
