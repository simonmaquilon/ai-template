# Adopción de versiones de la plantilla

Un proyecto derivado guarda en `.agents/template-version` la versión de la plantilla que adoptó, y `01-meta-guidelines.md` pide actualizarla solo al adoptar una versión posterior. Este documento explica cómo hacerlo sin perder el trabajo del proyecto.

## Qué pertenece a la plantilla

Son de la plantilla los archivos cuyos cambios suben su versión según `01-meta-guidelines.md`:

- las instrucciones de `.agents/instructions/` y las referencias primarias y la tabla de enrutado de `AGENTS.md`;
- los esqueletos de `PRODUCT.md`, `DESIGN.md`, `PLAN.md`, `TESTS.md`, `BUGS.md`, `SECURITY.md` y `README.md`;
- los documentos de `.readme/` con prefijo 90 o superior;
- la configuración de agentes que declara el repositorio (`CLAUDE.md`, `.claude/`, `.codex/`, `.mcp.json`, `.playwright/`);
- los scripts de `.scripts/` y el workflow de `.github/workflows/`;
- las skills de `.agents/skills/` y `skills-lock.json`;
- las reglas de la plantilla en `.gitignore`, `.gitattributes` y `.temp/.gitignore`.

Lo demás es del proyecto: el código, el contenido con que rellenó las referencias primarias, sus documentos de `.readme/` por debajo de 90 y sus políticas propias, enrutadas y registradas como desviaciones en `AGENTS.md`.

## Localizar las dos versiones

Cada commit que cambia la línea base sube `.agents/template-version` en uno. Añade el repositorio de la plantilla como remoto y busca el commit de la versión que tienes y el de la que quieres adoptar:

```bash
git remote add plantilla <url de la plantilla>
git fetch plantilla
git log plantilla/main -p --format='%h %s' -- .agents/template-version
```

Cada entrada muestra el commit y la línea `+N` con la versión que fija. El cambio de la plantilla entre ambas versiones es:

```bash
git diff <commit-actual> <commit-nuevo> --stat
git diff <commit-actual> <commit-nuevo> -- <ruta>
```

## Traer los cambios

Revisa archivo por archivo el diff entre las dos versiones, solo en las rutas de la plantilla:

- Si el proyecto no modificó el archivo (`git diff <commit-actual> HEAD -- <ruta>` no muestra nada), toma la versión nueva con `git restore --source=<commit-nuevo> -- <ruta>`, que también borra el archivo si la versión nueva lo retiró.
- Si lo modificó, por una desviación registrada en `AGENTS.md` o porque la propia plantilla pide adaptarlo, como la tabla de permisos de [Skills de agentes](90-agent-skills.md), los plugins de [Servidores de lenguaje de agentes](93-agent-language-servers.md), los servidores de [Servidores de herramientas de agentes](95-agent-tool-servers.md) o sus reglas de `.gitignore`, aplica el cambio de la plantilla a mano y conserva lo del proyecto.
- En las referencias primarias ya rellenadas, nunca tomes el esqueleto nuevo. Traslada solo los cambios de estructura: secciones o columnas nuevas, renombradas o retiradas, marcadores y textos de guía. Mueve el contenido existente a su nuevo sitio y deja con `TODO` lo que falte por decidir.
- De las skills, trae solo las carpetas de `.agents/skills/` que cambió la plantilla y sus entradas de `skills-lock.json`, copiadas tal como están en la versión nueva, sin recalcular ni editar hashes (`06-commands-and-local-runtime.md`); conserva las skills que añadió el proyecto y revisa los permisos y hooks que se conceden las que cambian, como pide [Skills de agentes](90-agent-skills.md).
- Si la versión nueva retira una instrucción, bórrala junto con su entrada de enrutado, sin reutilizar su prefijo (`01-meta-guidelines.md`).
- Si una instrucción nueva de la plantilla usa el prefijo de una instrucción propia del proyecto, `.scripts/check-instructions.mjs` lo avisa: la de la plantilla conserva su prefijo, y la del proyecto pasa a uno libre, con su entrada de enrutado y todas sus citas actualizadas.

En el mismo cambio, fija en `.agents/template-version` la versión adoptada y registra en `AGENTS.md` cada desviación deliberada que conserves, con el enlace a la política del proyecto que la sustituye.

## Después de adoptar

- `node .scripts/run-checks.mjs` termina sin fallos.
- Codex vuelve a pedir la aprobación de los hooks que cambiaron, como explica [Hooks de agentes](92-agent-hooks.md).
- Los binarios de los servidores de lenguaje siguen instalados en la versión que registra [Servidores de lenguaje de agentes](93-agent-language-servers.md).
- El workflow heredado queda activo en GitHub hasta que el proyecto lo desactive, como explica [CI de la plantilla](94-template-ci.md).
