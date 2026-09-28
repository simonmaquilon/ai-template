# Skills de agentes

Las skills de agentes se instalan desde repositorios públicos y se versionan en este repositorio bajo `.agents/skills/`. El archivo `skills-lock.json` en la raíz fija cada skill a su origen y a un hash de integridad.

## Herramienta

Las gestiona el CLI [`vercel-labs/skills`](https://github.com/vercel-labs/skills), que se ejecuta con `npx` sin instalarse como dependencia del proyecto.

## Comandos

```bash
# Actualizar las skills del proyecto a su última versión
npx skills update -p

# Sin prompts interactivos
npx skills update -p -y

# Actualizar una skill concreta
npx skills update nuxt

# Añadir una skill nueva
npx skills add <owner/repo>
```

Opciones de `update`: `-g` solo skills globales, `-p` solo skills del proyecto, `-y` omite el prompt de alcance, y uno o más nombres para acotar a skills concretas.

Tras `add` o `update`, y antes de invocar la skill o dar el cambio por bueno, revisa `git diff HEAD -- ".agents/skills/*/SKILL.md"` en sus cabeceras `allowed-tools` y `hooks`, y lo que el instalador haya escrito en `.claude/settings.json` o `.codex/hooks.json`. Lo que exceda los permisos del repositorio es una decisión abierta bajo `03-approval-boundaries.md`, y lo aceptado se registra en la sección de permisos de este archivo.

## Cómo funciona la actualización

El comando resuelve el alcance, lee `skills-lock.json`, descarga los hashes remotos para compararlos, identifica las desactualizadas, reinstala las que cambiaron y reescribe el lockfile. Una skill sin cambios se reinstala igualmente pero conserva su hash.

`computedHash` se calcula sobre el contenido **remoto** en el momento de la instalación, no sobre el archivo local, así que un `sha256` del `SKILL.md` de este repositorio no coincidirá con él.

## Ubicación

Las skills viven en `.agents/skills/`. El directorio `.claude/skills` es un symlink a esa ruta para que el cliente de Claude las descubra.

### Symlink en Windows

En Windows, Git solo crea el symlink si tiene permiso para hacerlo. Hay que activar el Modo de desarrollador de Windows, o trabajar como administrador, y clonar con `git clone -c core.symlinks=true <url>`. En un clon hecho sin eso, `.claude/skills` es un archivo de texto con la ruta de destino: Claude Code no encuentra las skills, el hook de Impeccable de Claude Code no se ejecuta y los agentes de `.claude/agents/` apuntan a una ruta rota. El hook de symlinks lo avisa en cada mensaje, como explica [Hooks de agentes](92-agent-hooks.md).

Para arreglar un clon existente, activa el Modo de desarrollador, ejecuta `git config core.symlinks true`, borra el archivo `.claude/skills` y restáuralo con `git checkout -- .claude/skills`.

## Permisos que se conceden las skills

Una skill puede preaprobar herramientas en la cabecera `allowed-tools` de su `SKILL.md`: durante el turno en que se invoca, Claude Code ejecuta esos comandos sin pedir permiso, aunque la carpeta no tenga aceptada la confianza, y la concesión caduca con el siguiente mensaje. Las reglas `ask` y `deny` de `.claude/settings.json` prevalecen sobre esa cabecera, y Codex no la aplica. El instalador de una skill puede además escribir hooks en la configuración de los clientes.

`28-agent-tooling-configuration.md` exige revisar ambas cosas antes de invocar o aceptar una skill nueva o actualizada, y registrar aquí lo aceptado. `.claude/settings.json` no declara reglas `allow` en `permissions`, así que cualquier preaprobación excede los permisos del repositorio y es una decisión abierta bajo `03-approval-boundaries.md`. Estas son las concesiones aceptadas, que heredan los proyectos derivados; si la cabecera o los hooks de una skill dejan de coincidir con su fila, lo nuevo no está aceptado y hay que revisarlo:

| Skill | Concesión | Alcance real |
| --- | --- | --- |
| `playwright-cli` | `allowed-tools`: `Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)` | Cualquier comando `npm` o `npx`, no solo los de Playwright, incluidos `npm install`, `npm i` y `npm publish`: `.claude/settings.json` no declara reglas `ask` que pidan confirmación para ellos. Solo actúa en Claude Code, porque Codex no aplica la cabecera. |
| `impeccable` | Hooks `PostToolUse` y `Stop` que su instalador escribe en `.claude/settings.json` y `.codex/hooks.json` | Ejecutan `scripts/impeccable hook` tras cada edición y al cerrar el turno. El lanzador ejecuta el primer motor que encuentra: el de `IMPECCABLE_BIN`, uno junto al lanzador, `~/.impeccable/bin/impeccable`, el de la versión de `scripts/VERSION` en `~/.impeccable/bin/<versión>/` o un `impeccable` del `PATH`; el de `~/.impeccable/bin/impeccable` y el del `PATH` solo tienen que responder a su sonda, sin versión fijada ni hash verificado. Si no encuentra ninguno, descarga el de esa versión a `~/.impeccable/bin/<versión>/` y lo verifica con su `.sha256` (en Windows, a `%USERPROFILE%\.impeccable\bin\<versión>\`, o bajo `IMPECCABLE_HOME` si está definido). Claude Code los ejecuta sin aprobación; Codex, tras aprobarlos, como explica [Hooks de agentes](92-agent-hooks.md). |

## Navegador operado por el agente

Los dos clientes cargan `playwright-cli` desde `.agents/skills/`: Codex busca ahí las skills del repositorio y Claude Code llega a través del symlink `.claude/skills`. La capacidad queda configurada en ambos en cuanto su binario está disponible, como explica la sección siguiente, y `17-validation-policy.md` solo la exige cuando `PLAN.md` la adopta. En Windows, Claude Code llega a la skill solo si el symlink existe, como explica la sección de ubicación. El sandbox del cliente puede impedir que arranque el navegador; los casos conocidos por sistema están en [Sandbox de agentes](91-agent-sandbox.md).

## Binario de `playwright-cli`

La skill no incluye el binario. Usa un `playwright-cli` global si existe; si no, `npx playwright cli`; y si tampoco, propone instalarlo globalmente. En un proyecto que tiene Playwright como dependencia prevalece la versión que fija su lockfile: comprueba antes `npx --no-install playwright --version` y, si responde, usa `npx playwright cli` aunque haya un global. Instalar `@playwright/cli` es añadir un binario bajo `07-dependencies-and-binaries.md`; si depende de una prerelease de `playwright` (compruébalo con `npm view @playwright/cli dependencies`), requiere además aprobación explícita.

Sus snapshots y trazas van a `.temp/playwright-cli/`: lo fija `outputDir` en `.playwright/cli.config.json`, que la herramienta carga por defecto desde la carpeta en la que se ejecuta. Ejecútala desde la raíz del repositorio; desde otra carpeta no encuentra esa configuración y escribe en `.playwright-cli/` dentro de esa carpeta. Como todo artefacto de tarea bajo `.temp/`, se borran al cerrar la tarea, según `06-commands-and-local-runtime.md`.

## Problema conocido: skills omitidas

Cuando el CLI avisa `Multiple current paths match these skills from <origen>`, omite esa skill en lugar de borrar o migrar la equivocada. Ocurre porque el symlink `.claude/skills` hace que la misma skill resuelva en dos rutas. La skill omitida queda intacta y sigue funcionando con la versión que tenía fijada. Hoy le ocurre a `impeccable`, que se actualiza como indica la sección siguiente.

## Actualizar Impeccable

`impeccable` se actualiza con su propio CLI y después se reinstala desde su origen para refrescar su hash en `skills-lock.json`:

```bash
# Actualizar la skill y regenerar sus agentes y hooks
npx impeccable update --project --yes --force

# Reinstalar la skill desde su origen y refrescar su hash en el lockfile
npx skills add pbakaus/impeccable --skill impeccable --agent codex --copy --yes --full-depth
```

`--agent codex --copy` instala solo en `.agents/skills/`, que es la ruta real, y así evita la ambigüedad del symlink. El primer paso deja el binario del motor dentro de la skill y el segundo lo retira: el lanzador `scripts/impeccable` lo descarga y verifica en la caché del usuario, `~/.impeccable/bin/<versión>/`, la primera vez que se ejecuta.

Tras el segundo paso, `npx impeccable check` avisa `Updates available` aunque no exista una versión nueva: la copia del origen difiere de la que genera el CLI de Impeccable, que adapta rutas y comandos a Claude Code. Ese aviso no sirve para saber si hay una actualización.

El instalador escribe además estos archivos fuera de la skill:

- `.claude/agents/impeccable-*.md`: agentes de Claude Code generados; se versionan.
- `.codex/hooks.json`: hook de diseño de Codex; se versiona.

El hook de diseño de Claude Code se versiona en `.claude/settings.json` para que llegue a los proyectos derivados. El instalador lo reconoce ahí y no crea `.claude/settings.local.json`; si una máquina conserva una copia anterior en ese archivo, Claude Code ejecuta el hook duplicado una sola vez.

## Impeccable, `PRODUCT.md` y `DESIGN.md`

Los esqueletos de `PRODUCT.md` y `DESIGN.md` siguen el formato que leen y escriben las referencias `init` y `document` de Impeccable (`reference/init.md` y `reference/document.md` de la skill), para que la skill los actualice en lugar de crear una autoridad paralela:

- `PRODUCT.md` lleva el marcador `impeccable:product-schema` y las secciones de `init` en su orden; `DESIGN.md`, el frontmatter de tokens y las ocho secciones canónicas del formato DESIGN.md. Detrás van las secciones propias de la plantilla, que la skill conserva.
- Los encabezados, las claves del frontmatter y el marcador van en inglés, y el contenido en español, como fija `15-language-and-naming.md`.
- El frontmatter de `DESIGN.md` es la fuente normativa de los tokens que su esquema admite (colores, tipografía, radios, espaciado y componentes) y la sección `Stack` de `PRODUCT.md`, la del stack, como fijan `12-ui-theming-and-tokens.md` y `21-document-maintenance.md`. `init` solo escribe `Stack` en un proyecto nuevo; cuando falta, manda el stack instalado, como define `04-sources-and-skills.md`.
- Los tokens que el esquema no admite, como sombras, movimiento o puntos de corte, los fija el código y los describe su sección de `DESIGN.md`; el complemento `design.json` solo los refleja.
- Si `init` o `document` proponen contenido que ya tiene sitio en una sección propia de la plantilla, como la terminología, las métricas de éxito, las decisiones abiertas, la voz del contenido o el estándar de accesibilidad, ese contenido va a esa sección y no se duplica; las restricciones técnicas van a `PLAN.md`.
- Mientras `Platform` conserve su `TODO`, `impeccable context` avisa de que no reconoce el valor y trata el proyecto como `web`. El aviso desaparece al escribir `web`, `ios`, `android` o `adaptive`.

En `.impeccable/`, `config.json` guarda la configuración compartida y se versiona. `design.json` es el complemento de `DESIGN.md` que `document` regenera con él: el CLI no lo excluye, así que se versiona junto a `DESIGN.md` y nunca se edita a mano, como pide `14-code-authoring.md`. `config.local.json` guarda los ajustes de cada persona y `.gitignore` lo ignora, así que no se versiona. También se versionan `critique/ignore.md`, las supresiones que `critique` vuelve a leer en cada ejecución (`reference/critique.md`), y `live/config.json`, la configuración del modo live (`reference/live-setup.md`). El resto son artefactos de trabajo que `.gitignore` ignora: las maquetas de `mocks/`, incluidas las descartadas, que no implican aprobación (`reference/new-work.md`); las capturas y medidas de `review/` y `build/`; los informes de `critique/`, que se entregan en la conversación; y los archivos de ejecución de `live/`.
