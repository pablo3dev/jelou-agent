# Constitución — [nombre del proyecto]

Directrices de alto nivel del proyecto, escritas para el LLM de un agente: el "qué y por qué" (principios y decisiones) que guía todo el flujo IDEA → DEPLOY. No reemplaza `deploy.md`, `git.md` ni `test.md` (el "cómo" técnico): en su ámbito técnico estricto gana el `config/*.md` correspondiente; en negocio, arquitectura, UX, seguridad y estrategia gana este documento. Una contradicción real entre ambos se reporta al USUARIO, no se resuelve por inferencia.

Esta constitución tiene DOS ÁMBITOS pares, que pueden existir a la vez:

- `## Global`: lo que aplica a TODO el proyecto o a más de una unidad.
- `## Unidad: <ruta>`: lo que aplica SOLO a esa unidad (app, extension…). Una sección por cada unidad con directrices propias; la unidad hereda lo global y, si hay choque, prevalece la suya dentro de esa unidad.

Ubicación: ante cada directriz, decide su ámbito. Si aplica a una sola unidad, va en su `## Unidad`, no en Global. Si no es claro, pregunta al USUARIO. Un proyecto de una sola unidad puede tener solo Global; uno multi-unidad suele tener ambos. Cada agente lee solo `## Global` y la sección de su unidad. Los encabezados `## Global` y `## Unidad: <ruta>` son literales: no se renombran.

Los `###` de abajo son ejemplos de títulos, no una lista cerrada ni obligatoria: adáptalos al proyecto o unidad (renombra, agrega, quita, divide). Cada directriz va bajo un título específico de su tema; si ninguno encaja, crea uno nuevo. No existe sección "otros/varios".

Rellena SOLO lo que aplica y BORRA el resto. Nada se inventa para completar una sección. Si el archivo no existe, MakIA procede sin él.

## Global

Ámbito: todo el proyecto o más de una unidad.

### Ejemplo de título: Principios fundamentales

<!-- Decisiones técnicas guiadas por negocio, mercado, UX, datos y arquitectura. -->

### Ejemplo de título: Configuración host

<!-- Qué necesita la máquina host para ejecutar el proyecto. -->

### Ejemplo de título: Configuración de plataforma destino

<!-- Qué tener o hacer para compilar a la plataforma destino. -->

### Ejemplo de título: Principios de seguridad

<!-- Reglas de seguridad del proyecto que todo cambio debe cumplir. -->

### Ejemplo de título: Estrategias de implementación

<!-- Cómo se prefiere implementar: patrones, orden, límites. -->

## Unidad: <ruta de la unidad, p. ej. apps/cli>

Ámbito: solo esta unidad. Duplica y renombra este bloque por cada unidad con directrices propias; bórralo si ninguna las tiene.

### Ejemplo de título: Estrategias de implementación

<!-- Directrices que aplican solo a esta unidad. Sus títulos `###` son adaptables, con las mismas reglas que en Global. -->

> **Seguridad:** ningún token, credencial o valor sensible se escribe aquí en texto plano — siempre `${NOMBRE_VARIABLE}` resuelto desde el entorno. Este archivo vive en `.makia/config/constitution.md` de cada proyecto, se versiona, y nunca se genera con contenido inventado por MakIA.
