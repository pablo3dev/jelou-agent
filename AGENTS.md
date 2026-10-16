# MakIA

Este proyecto usa MakIA para orquestar el desarrollo agéntico.

Toda petición, sin excepción, pasa primero por el Orquestador de MakIA,
definido en `.makia/core/agents/orchestrator/orchestrator.md`. Antes de actuar sobre cualquier tarea de
este proyecto, lee ese archivo primero: ahí se define el flujo de trabajo,
qué skills existen y cómo delegarlas.

La constitución del proyecto, `.makia/config/constitution.md`, es la memoria de contexto
de este proyecto: reúne sus directrices propias (principios, configuración del
host y de la plataforma destino, seguridad, estrategias de implementación;
globales y por unidad). Léela (`## Global` y la sección de tu unidad) antes de
tomar cualquier decisión, y no edites este archivo para agregar directrices del
proyecto.

La documentación del proyecto (specs, decisiones, guías) vive en
`.makia/docs/` — ver `README.md`.

## Invocación de `makia` por plataforma

- Windows: `.makia\bin\makia.cmd <comando>` (o `python .makia\bin\makia <comando>`).
- macOS/Linux: `.makia/bin/makia <comando>`.

## Actualización BREAKING (reorganización de src/, v3.5.0)

Si `.makia/bin/makia update` falla con un error de sistema de archivos y esta
instalación es anterior a v3.5.0, migra una sola vez:

    uvx --refresh --from "git+ssh://git@github.com/pablo3dev/makia.git#subdirectory=apps/cli" makia update --dir .

.makia/config/ y .makia/docs/ no se tocan. Después, `update` vuelve a funcionar normalmente.
