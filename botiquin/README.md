# MediHome 💊

Aplicación web móvil para gestionar el botiquín del hogar. Funciona directamente en el navegador sin instalación, guarda los datos en el dispositivo y puede sincronizarse con Google Sheets para tener una copia en la nube.

---

## ¿Qué hace?

### Inicio (Dashboard)
- Saludo personalizado según la hora del día
- Resumen del inventario: total de medicamentos, tratamientos activos, próximos a caducar y con stock bajo
- Alertas automáticas de caducidad (≤ 30 días) y stock bajo

### Botiquín
- Listado completo de medicamentos con tarjetas visuales
- Etiquetas de unidad, uso y categoría (Adultos / Niños / Animales)
- Chips de stock, fecha de caducidad y ubicación con código de color (verde / amarillo / rojo)
- Barra de progreso de stock respecto al mínimo configurado
- Filtros rápidos: Todos · Stock bajo · Caducan pronto · Caducados · Para SIGRE
- Buscador por nombre o ubicación

### Tratamientos
- Registro de tratamientos vinculados a un medicamento
- Dosis por toma, frecuencia (1×, 2×, 3×, 4× al día, semanal, según necesidad)
- Fechas de inicio y fin, instrucciones de toma
- Registro de dosis tomadas con descuento automático de stock
- Búsqueda de medicamento al crear o editar un tratamiento

### SIGRE
- Marca medicamentos caducados o no deseados para llevar al punto SIGRE de la farmacia
- Genera un informe de entrega que puedes copiar al portapapeles

### Configuración
- Exportar inventario a **JSON** (copia de seguridad completa) o **CSV**
- Importar desde JSON o CSV (con opción de fusionar o reemplazar)
- Conexión con Google Sheets (ver sección siguiente)
- Botón para cargar datos de ejemplo

---

## Datos de medicamentos

Cada medicamento almacena los siguientes campos:

| Campo | Descripción |
|-------|-------------|
| Nombre | Nombre del medicamento |
| Principio activo | Principio activo del medicamento |
| Cantidad | Unidades disponibles actualmente |
| Unidad | comprimidos, ml, cápsulas, etc. |
| Stock mínimo | Alerta cuando la cantidad baje de este valor |
| Caducidad | Mes y año en formato MM/YYYY |
| Ubicación | Dónde está guardado (botiquín, nevera…) |
| Categoría | Adultos / Niños / Animales |
| Mascota | Perro / Gato / Ambos (solo si categoría = Animales) |
| Uso | analgésico, antibiótico, antiinflamatorio… |
| Notas | Instrucciones o avisos libres |
| SIGRE | Marcado para entrega en punto SIGRE |

---

## Almacenamiento local

Todos los datos se guardan en el **localStorage** del navegador. No requieren cuenta ni servidor. Los datos persisten mientras no se borre el caché del navegador.

> Para no perder datos, haz exportaciones periódicas desde Configuración → Exportar JSON.

---

## Sincronización con Google Sheets (opcional)

La app puede conectarse a una hoja de Google Sheets mediante un script de Apps Script. Esto permite tener los datos en la nube y acceder desde cualquier dispositivo.

### URL del script activo

```
https://script.google.com/macros/s/AKfycbxMecoCF3POA0wCZMpC8R_rOSPifmxufcfd5gVvRMhhTYUwuDlUrgLcqx9asFYvHJbGaA/exec
```

Para configurarla en la app: **Configuración → icono de Google Sheets → pegar la URL → Guardar**.

### Estructura del Google Sheet

El script trabaja con tres pestañas. Las cabeceras de la **fila 1** deben ser exactamente estas:

**Medicaments** (15 columnas A–O)
```
ID | Nom | PrincipioActivo | Quantitat | Unitat | StockMinim | Caducitat | Ubicacio | Categoria | Mascota | Notes | SIGRE | DataSIGRE | DataCreacio | Estat
```

**Tractaments** (12 columnas A–L)
```
ID | Nom | MedicamentID | MedicamentNom | DosisQuantitat | Frequencia | Instruccions | DataInici | DataFi | Actiu | DataCreacio | Estat
```

**Dosis** (10 columnas A–J)
```
ID | TractamentID | MedicamentID | MedicamentNom | Quantitat | Data | Hora | Notes | DataCreacio | Estat
```

### Crear el Google Sheet desde cero con `initSheets()`

La forma más sencilla de preparar la hoja es dejar que el propio script la construya:

1. Crea un **Google Sheet vacío** (sin pestañas con datos)
2. Ve a **Extensiones → Apps Script**, pega el contenido de `Code.gs` y guarda
3. En el editor de Apps Script, en la barra superior selecciona la función **`initSheets`** y pulsa **Ejecutar**
4. Acepta los permisos que te pida Google
5. El script crea automáticamente las tres pestañas (`Medicaments`, `Tractaments`, `Dosis`) con las cabeceras correctas, formato oscuro en la fila 1 y la primera fila fija

> `initSheets()` solo crea cabeceras si la celda A1 de cada pestaña está vacía. Si ya tienes datos, no toca nada — tendrás que ajustar las columnas manualmente según la estructura indicada arriba.

### Cómo funciona la sincronización

- **Al abrir la app**: descarga los registros activos de Sheets y los fusiona con localStorage
- **Al guardar o editar**: actualiza localStorage de inmediato (UI optimista) y envía el cambio a Sheets en segundo plano
- **Borrado lógico**: los registros eliminados se marcan con `Estat = inactiu` en Sheets, nunca se borran físicamente

### Configurar el Apps Script

1. Abre el Google Sheet → **Extensiones → Apps Script**
2. Pega el contenido de `Code.gs` de este repositorio
3. Ve a **Implementar → Nueva implementación**
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
4. Copia la URL `/exec` generada y pégala en la app

> Cada vez que modifiques el script tienes que crear una nueva implementación — la URL `/exec` cambia.

### Notas para móvil (iOS Safari)

Si la sincronización falla en iPhone o iPad:
- Ve a **Ajustes → Safari → Privacidad y seguridad**
- Desactiva **"Privacidad avanzada de seguimiento web"**

Esto es necesario porque iOS Safari bloquea las redirecciones entre dominios que usa Google Apps Script.

---

## Archivos del proyecto

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Toda la aplicación (HTML + CSS + JS en un solo archivo) |
| `Code.gs` | Backend de Google Apps Script para la sincronización con Sheets |

---

## Uso sin conexión

La app funciona completamente sin internet. La sincronización con Sheets es opcional y se ejecuta en segundo plano sin bloquear la interfaz.
