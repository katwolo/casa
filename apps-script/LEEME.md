# Script Casa

Un único proyecto de Apps Script para todas las secciones de Casa. Controla quién entra (tú o tu pareja) y qué puede hacer cada uno en cada sección. Las secciones se irán migrando a este script una a una; mientras tanto, cada web sigue usando su script de siempre.

## Archivos

| Archivo | Qué hace |
|---|---|
| `Codigo.gs` | Recibe las peticiones y las envía a la sección correspondiente. |
| `acceso.gs` | Claves, permisos de la pareja y registro de intentos fallidos. |
| `comidas.gs` | Sección Comidas: recetas, menú semanal y lista de la compra. |
| `botiquin.gs` | Sección Botiquín: medicamentos, tratamientos y dosis. |
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
| `CLAVE_PAREJA` | Ajustes | Clave de tu pareja. Se crea, cambia o quita desde Ajustes. |
| `PERMISOS_PAREJA` | Ajustes | Ninguno / ver / editar en cada sección. |
| `AVISO_EMAIL` | Ajustes | `si` para recibir un correo si alguien usa una clave incorrecta (como mucho uno por hora). |
| `REGISTRO_FALLOS` | El script | Los últimos 50 intentos con clave incorrecta. |

## Al actualizar el código

Pega los archivos nuevos y haz **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**. Así la URL no cambia. Las claves y los permisos no se tocan, porque están en las propiedades.

## Secciones migradas

| Sección | Archivo | Propiedad con la hoja | Notas |
|---|---|---|---|
| Comidas | `comidas.gs` | `COMIDAS_SPREADSHEET_ID` | Usa la misma hoja que la web original si_chef. Mientras uses las dos webs a la vez, la caché de Casa dura solo 5 minutos para que los cambios hechos desde la original se vean pronto. |
| Botiquín | `botiquin.gs` | `BOTIQUIN_SPREADSHEET_ID` | Usa la misma hoja que la web original MediHome (pestañas Medicaments, Tractaments y Dosis). |

Para añadir una sección: crea su archivo `.gs` en el proyecto, añade su propiedad con el ID de la hoja y publica una **nueva versión**. La primera vez que una sección use un servicio nuevo de Google (Sheets, Drive…), el editor te pedirá autorizarlo.

## Al cambiar los archivos de la web

Los navegadores guardan una copia de `comun/casa.js`, `comun/estilo.css` y `ajustes/ajustes.js` durante un rato. Por eso las páginas los cargan con un número de versión (`casa.js?v=4`). Cada vez que cambie alguno de esos archivos, se sube ese número en todas las páginas, para que el navegador descargue la versión nueva.

## Si sale un error de permisos («No tienes permiso para llamar a…»)

1. Comprueba que `appsscript.json` del proyecto tiene la lista `oauthScopes` de este repositorio. Si una sección nueva necesita otro servicio de Google (por ejemplo Drive), se añade ahí.
2. En el editor, elige la función `autorizar` en el desplegable de arriba y pulsa **▶ Ejecutar**. Acepta la ventana de permisos de Google. En el registro verás si puede abrir cada hoja.
3. Publica una **nueva versión** de la implementación.
