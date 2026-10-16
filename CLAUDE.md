# MakIA (Claude Code)

Este proyecto usa MakIA para orquestar el desarrollo agéntico.

Toda petición, sin excepción, pasa primero por el Orquestador de MakIA,
definido en `.makia/core/agents/orchestrator/orchestrator.md`. Antes de actuar sobre cualquier tarea de
este proyecto, lee ese archivo primero: ahí se define el flujo de trabajo,
qué skills existen (expuestas también como comandos en `.claude/commands/`)
y cómo delegarlas.

La constitución del proyecto, `.makia/config/constitution.md`, es la memoria de contexto
de este proyecto: reúne sus directrices propias (principios, configuración del
host y de la plataforma destino, seguridad, estrategias de implementación;
globales y por unidad). Léela (`## Global` y la sección de tu unidad) antes de
tomar cualquier decisión, y no edites este archivo para agregar directrices del
proyecto.

La documentación del proyecto (specs, decisiones, guías) vive en
`.makia/docs/` — ver `README.md`.
