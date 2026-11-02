# Changelog / Historial de cambios

# Deepnest — C&M Designs Edition

---

## English

### [1.1.0] - 2026-11-01

#### Features and improvements

- Added an optional rectangular inner-NFP experimental mode, selectable from Settings; Normal remains the default.
- Added NFP pair deduplication to reduce repeated pair preparation.
- Added opt-in nesting profiling with manually exported geometry snapshots and an independent audit tool.
- Added a persisted Debug Mode setting. Profiling is fixed for each application session and requires a restart after changing the setting; `CM_NEST_PROFILE=1` remains available as a developer override.
- Localized the new optimization, diagnostics, nesting-control, and interface-improvement text for Spanish and English, and removed the duplicate Optimization engine label in Settings.
- Aligned the single Optimization engine heading in the left Settings column and its Normal/Experimental controls and descriptions in the right column.
- Grouped manual profile and geometry-snapshot exports in the results toolbar, with a project-data warning, private-field redaction, and overwrite confirmation.
- Added a compact Experimental status indicator in the nesting toolbar.
- Removed the confusing laser-time-saved metric from the results panel while retaining the total cutting-time estimate.
- Added source SVG filenames and secondary dimensions beside each part thumbnail in the import list, with readable contrast in both themes.
- Fixed SVG tabs at 150 px with single-row horizontal scrolling and truncated labels with full-name tooltips.
- Improved nesting progress, completion reporting, and recovery of the best valid result.

#### Known limitation

- A real 100-piece Experimental audit found no overlaps and no parts outside their sheets, but measured two clearances approximately 0.00000001222 mm below the configured 0.5 mm. The formal audit result is FAIL for strict spacing. Experimental is not geometrically certified.
- Separate four-piece Normal runs with zero spacing observed microscopic coordinates beyond a sheet boundary (up to approximately 0.00000054 mm in the tested fixtures); strict boundary auditing reports FAIL. No engine correction is included in v1.1.0.

#### Diagnostics

- Profiling is disabled by default and can be enabled in Settings with Debug Mode (restart required); developers can also force it for a session with `CM_NEST_PROFILE=1`.
- Geometry audit scripts are development tools and are not included in the application package. The snapshot serializer required by the optional export is included.

---

### [1.0.0] - 2026-10-30

First stable release of Deepnest — C&M Designs Edition,
customized for laser cutting and material optimization.

#### Features and improvements

- Bilingual interface: English and Spanish.
- Automatic nesting across multiple material sheets.
- Visual sheet boundaries in the nesting preview.
- Individual SVG sheet export for LightBurn.
- Configurable optimization limits: 3, 5, 10, 15 minutes,
  or unlimited execution.
- Optional automatic stopping after a configurable
  period without improvements.
- Protection against stopping before a valid nesting
  result is available.
- Restore the last nesting result without recalculation.
- Estimated laser cutting time based on cutting speed,
  travel speed, number of passes, and additional time
  per sheet.
- Improved nesting statistics and interface translations.
- Customized C&M Designs Edition branding.

#### Bug fixes

- Linux compatibility and stability improvements.
- Background nesting process fixes.
- Dynamic statistics update corrections.
- Navigation improvements between application screens.
- Disabled automatic Developer Tools opening
  in packaged builds.

#### Distribution

- Linux AppImage (x86_64).

### Planned for version 1.0.1

- Saved material library.
- Quick selection of sheet dimensions.
- Editing and management of custom material presets.

---

## Español

### [1.1.0] - 2026-11-01

#### Funciones y mejoras

- Añade un modo Experimental opcional de NFP interior rectangular, seleccionable desde Configuración; Normal sigue siendo el predeterminado.
- Deduplica pares NFP durante su preparación para reducir trabajo repetido.
- Añade perfilado opcional del anidado, exportación manual de snapshots geométricos y una herramienta independiente de auditoría.
- Añade el Modo depuración persistente. El perfilado queda fijo por sesión y requiere reiniciar tras cambiar el ajuste; `CM_NEST_PROFILE=1` sigue disponible para diagnóstico de desarrolladores.
- Corrige la localización de los nuevos textos de optimización, diagnóstico, controles de anidado y mejoras de interfaz en español e inglés; elimina la etiqueta duplicada del motor de optimización en Configuración.
- Alinea la única etiqueta Motor de optimización en la columna izquierda de Configuración y sus opciones Normal/Experimental con las descripciones en la columna derecha.
- Agrupa la exportación manual de perfiles y snapshots en la barra de resultados, con aviso sobre datos del proyecto, redacción de campos privados y confirmación antes de sobrescribir.
- Añade un indicador compacto de Experimental en la barra de anidado.
- Elimina del panel de resultados la métrica confusa de tiempo de láser ahorrado y conserva la estimación del tiempo total de corte.
- Muestra el nombre del SVG de origen y sus dimensiones debajo del nombre, junto a la miniatura de cada pieza importada, con contraste legible en ambos temas.
- Fija las pestañas SVG en 150 px, mantiene una sola fila desplazable y muestra tooltips con los nombres completos truncados visualmente.
- Mejora el seguimiento del progreso, el reporte de finalización y la recuperación del mejor acomodo válido.

#### Limitación conocida

- Una auditoría real Experimental de 100 piezas no encontró solapamientos ni piezas fuera de sus hojas, pero midió dos separaciones aproximadamente 0.00000001222 mm menores que los 0.5 mm configurados. El resultado formal es FAIL por separación estricta. El modo Experimental no está certificado geométricamente.
- En pruebas Normal separadas de cuatro piezas con separación cero se observaron coordenadas microscópicas fuera del límite de una hoja (hasta aproximadamente 0.00000054 mm en las fixtures probadas); la auditoría estricta de límites informa FAIL. v1.1.0 no incluye una corrección del motor.

#### Diagnóstico

- El perfilado está desactivado de forma predeterminada y puede habilitarse en Configuración mediante Modo depuración (requiere reiniciar); `CM_NEST_PROFILE=1` continúa forzándolo para desarrolladores durante una sesión.
- Los scripts de auditoría geométrica son herramientas de desarrollo y no se incluyen en el paquete de la aplicación. Sí se incluye el serializador requerido para la exportación opcional de snapshots.

---

### [1.0.0] - 2026-10-30

Primera versión estable de Deepnest — C&M Designs Edition,
personalizada para corte láser y optimización de materiales.

#### Funciones y mejoras

- Interfaz bilingüe: español e inglés.
- Anidado automático en múltiples hojas de material.
- Visualización de los límites de cada hoja en la vista previa.
- Exportación de hojas individuales en formato SVG para LightBurn.
- Límites de optimización configurables: 3, 5, 10 y 15 minutos,
  o ejecución sin límite de tiempo.
- Detención automática opcional después de un período
  configurable sin encontrar mejoras.
- Protección para evitar detener el proceso antes de
  obtener un anidado válido.
- Recuperación del último anidado sin repetir el cálculo.
- Estimación del tiempo de corte láser según velocidad
  de corte, velocidad de desplazamiento, número de pasadas
  y tiempo adicional por hoja.
- Mejoras en las estadísticas y traducciones de la interfaz.
- Identidad visual personalizada C&M Designs Edition.

#### Correcciones

- Mejoras de compatibilidad y estabilidad en Linux.
- Correcciones del proceso de anidado en segundo plano.
- Correcciones en la actualización de estadísticas dinámicas.
- Mejoras de navegación entre pantallas.
- Desactivación de la apertura automática de Developer Tools
  en las versiones empaquetadas.

#### Distribución

- AppImage para Linux (x86_64).

### Planificado para la versión 1.0.1

- Biblioteca de materiales guardados.
- Selección rápida de dimensiones de hojas.
- Edición y administración de materiales personalizados.

---
