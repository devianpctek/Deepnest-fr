# Deepnest — C&M Designs Edition

**Version 1.1.0 / Versión 1.1.0**<br>
**Languages / Idiomas:** English · Español

A customized edition of Deepnest for laser-cutting workflows and efficient sheet-material nesting.

Una edición personalizada de Deepnest para trabajos de corte láser y el aprovechamiento eficiente de materiales en lámina.

---

## English

### Overview

Deepnest — C&M Designs Edition builds on the original Deepnest project with workflow improvements for laser cutting, particularly when working with MDF, acrylic, and other sheet materials.

### Main features

- Bilingual user interface: English and Spanish.
- Automatic nesting across multiple material sheets.
- Visible sheet boundaries in the nesting preview (not exported as cutting paths).
- Export of individual SVG sheets for use in LightBurn.
- Configurable optimization limits: 3, 5, 10, or 15 minutes, or no time limit.
- Optional stop after a configurable period without improvement.
- Safeguard against stopping before a valid nesting result is found.
- Return to the last valid nesting result without recalculating.
- Estimated laser cutting time based on cutting speed, travel speed, passes, and additional time per sheet.
- Improved nesting statistics and interface translations.
- Linux compatibility fixes and C&M Designs Edition branding.

### Installation on Linux (x86_64)

1. Download the AppImage from the [GitHub Releases page](https://github.com/devianpctek/Deepnest-fr/releases) once the release is published.
2. Make the downloaded file executable.
3. Run it.

~~~bash
chmod +x Deepnest-CM-Designs-Edition-1.1.0-x86_64.AppImage
./Deepnest-CM-Designs-Edition-1.1.0-x86_64.AppImage
~~~

The filename above is the intended release filename; use the actual downloaded filename if it differs.

### Basic workflow

1. Import your supported design files.
2. Configure material sheet dimensions and part quantities.
3. Set the optimization time and stopping conditions.
4. Start nesting and review sheet usage.
5. Export the individual SVG sheets for laser cutting.

### Release notes

See [CHANGELOG.md](CHANGELOG.md) for the full bilingual change history and planned improvements.

---

## Español

### Descripción

Deepnest — C&M Designs Edition parte del proyecto original Deepnest e incorpora mejoras orientadas al corte láser, especialmente al trabajar con MDF, acrílico y otros materiales en lámina.

### Funciones principales

- Interfaz bilingüe: español e inglés.
- Anidado automático en múltiples hojas de material.
- Límites visibles de cada hoja en la vista previa (sin exportarlos como trayectorias de corte).
- Exportación de hojas SVG individuales para utilizarlas en LightBurn.
- Límites de optimización de 3, 5, 10 o 15 minutos, o sin límite de tiempo.
- Detención opcional después de un intervalo configurable sin mejoras.
- Protección para no detenerse antes de obtener un anidado válido.
- Recuperación del último anidado válido sin repetir el cálculo.
- Estimación del tiempo de corte láser según velocidad de corte, desplazamiento, pasadas y tiempo adicional por hoja.
- Mejoras en las estadísticas y traducciones de la interfaz.
- Correcciones de compatibilidad con Linux e identidad visual C&M Designs Edition.

### Instalación en Linux (x86_64)

1. Descarga el AppImage desde la [página de versiones de GitHub](https://github.com/devianpctek/Deepnest-fr/releases) una vez publicada la versión.
2. Dale permisos de ejecución al archivo.
3. Ejecútalo.

~~~bash
chmod +x Deepnest-CM-Designs-Edition-1.1.0-x86_64.AppImage
./Deepnest-CM-Designs-Edition-1.1.0-x86_64.AppImage
~~~

El nombre anterior es el previsto para la publicación; si el archivo descargado tiene otro nombre, utiliza ese nombre real.

### Uso básico

1. Importa los archivos de diseño compatibles.
2. Configura las dimensiones de las hojas y la cantidad de piezas.
3. Ajusta el tiempo y las condiciones de detención de la optimización.
4. Inicia el anidado y revisa el aprovechamiento del material.
5. Exporta las hojas SVG individuales para el corte láser.

### Historial de cambios

Consulta [CHANGELOG.md](CHANGELOG.md) para ver las novedades de ambas versiones lingüísticas y las mejoras previstas.

---

## Original project / Proyecto original

This edition is based on [Deepnest by Jack Qiao](https://github.com/Jack000/Deepnest). Credit for the original project remains with its original author and contributors. The original project's license and applicable notices must be preserved in this derivative distribution.

Esta edición está basada en [Deepnest de Jack Qiao](https://github.com/Jack000/Deepnest). Se reconoce la autoría del proyecto original y las contribuciones de sus colaboradores. La licencia y los avisos correspondientes del proyecto original deben conservarse en esta distribución derivada.

---

## C&M Designs Edition

Customized for laser-cutting workflows.  
Personalizado para flujos de trabajo de corte láser.

**C&M Designs**
