# Casa

Las webs de casa reunidas en un solo sitio, con una clave para entrar y permisos para la pareja.

**Web:** <https://katwolo.github.io/casa/>

## Secciones

| Sección | Carpeta | Qué hace | Venía de |
|---|---|---|---|
| 🍲 Planificación de comidas | `comidas/` | Recetas, menú semanal y lista de la compra | si_chef |
| 💊 Botiquín | `botiquin/` | Medicamentos, tratamientos, dosis y SIGRE | MediHome |
| 🔧 Garaje | `garaje/` | Vehículos, mantenimientos, ITV, seguro y facturas (con lectura automática) | garatge |
| ⚖️ Registro de pesos | `pesos/` | Perfiles, registros de peso y objetivos | registro-peso |
| 💶 Economía | `economia/` | Movimientos, gastos fijos, presupuestos, objetivos y tickets | economia |
| 📝 Notes | `notes/` | Notas, tareas, eventos, libretas, fotos y grabaciones | diario |

Los datos siguen en las mismas Google Sheets y carpetas de Drive de siempre.

## Cómo está montado

```
index.html          portada con los círculos de cada sección
ajustes/            conexión, portada, acceso de la pareja y seguridad
comun/              casa.js (conexión con el script y preferencias) y estilo.css
apps-script/        el script Casa de Google: un archivo por sección + acceso.gs
comidas/ botiquin/ garaje/ pesos/ economia/ notes/   la web de cada sección
```

- **Un único script de Google** (`apps-script/`) atiende a todas las secciones. Cada petición lleva la clave del dispositivo y el script comprueba quién es y qué permiso tiene antes de tocar ninguna hoja.
- **Claves:** la tuya está en la propiedad `CLAVE_ADMIN` del script. La de la pareja se crea, se cambia o se quita desde **Ajustes**, junto con sus permisos por sección: *nada*, *ver* o *editar*.
- **Sin acceso** a una sección, esta no aparece en la portada. Con permiso de **ver**, la sección se abre en modo solo lectura.
- **Seguridad:** el script guarda los últimos intentos con clave incorrecta y puede avisar por correo (en Ajustes).
- **Gemini** lee las fotos y documentos en Notes, Garaje y Economía (con la clave `GEMINI_API_KEY` del script). Si falla, cada sección usa su lector de antes.

Instalación, propiedades del script y qué hacer si sale un error de permisos: [`apps-script/LEEME.md`](apps-script/LEEME.md).

## Al cambiar algo

- **Código del script:** pega los archivos de `apps-script/` en el proyecto Casa y publica una **nueva versión** de la implementación (la URL no cambia).
- **Archivos comunes** (`comun/casa.js`, `comun/estilo.css`, `ajustes/ajustes.js`): sube el número `?v=` con el que los cargan las páginas, para que los navegadores no usen una copia antigua.
- **Economía y Notes** tienen *service worker*: al cambiar sus archivos, sube también el número de `CACHE` en su `sw.js`.
