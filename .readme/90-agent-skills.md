# Skills de agentes

Las skills de agentes se versionan en este repositorio bajo `.agents/skills/`. Casi todas se instalan desde repositorios públicos, y `skills-lock.json`, en la raíz, fija cada una a su origen y a un hash de integridad; `commit`, `prompt`, `prompt-plan` y `start` son propias de la plantilla, no figuran en el lockfile y se editan directamente en `.agents/skills/`.

## Herramienta

Las gestiona el CLI [`vercel-labs/skills`](https://github.com/vercel-labs/skills), que se ejecuta con `npx` sin instalarse como dependencia del proyecto. Los comandos de este documento lo ejecutan, igual que el CLI de Impeccable, con `node .scripts/run-pinned.mjs`, que toma la versión fijada de Template Tooling en [STACK.md](../STACK.md), donde también consta su procedencia; cambiarla es una actualización que `07-dependencies-and-binaries.md` somete a aprobación.

## Comandos

```bash
# Actualizar las skills del proyecto a su última versión
node .scripts/run-pinned.mjs skills update -p

# Sin prompts interactivos
node .scripts/run-pinned.mjs skills update -p -y

# Actualizar una skill concreta
node .scripts/run-pinned.mjs skills update <nombre>

# Añadir una skill nueva
node .scripts/run-pinned.mjs skills add <owner/repo>

# Retirar una skill del proyecto
node .scripts/run-pinned.mjs skills remove <nombre> -y
```

`remove` borra la carpeta de la skill y su entrada de `skills-lock.json`, y deja intacto el symlink `.claude/skills`.

Opciones de `update`: `-g` solo skills globales, `-p` solo skills del proyecto, `-y` omite el prompt de alcance, y uno o más nombres para acotar a skills concretas.

Tras `add` o `update`, y antes de invocar la skill o dar el cambio por bueno, revisa `git diff HEAD -- ".agents/skills/*/SKILL.md"` en sus cabeceras `allowed-tools` y `hooks`, y lo que el instalador haya escrito en `.claude/settings.json` o `.codex/hooks.json`. Lo que exceda los permisos del repositorio es una decisión abierta bajo `03-approval-boundaries.md`, y lo aceptado se registra en la sección de permisos de este archivo. Si `update` alcanza a `security-audit`, restaura además la licencia que la plantilla le añade, que el CLI borra al reinstalar la carpeta: `git restore --source=HEAD -- .agents/skills/security-audit/LICENSE`.

## Cómo funciona la actualización

El comando resuelve el alcance, lee `skills-lock.json`, descarga los hashes remotos para compararlos, identifica las desactualizadas, reinstala las que cambiaron y reescribe el lockfile. Una skill sin cambios se reinstala igualmente pero conserva su hash.

Ninguna skill se fija a un commit con `ref`: por decisión del usuario, `update` trae siempre la última versión publicada y el hash solo detecta que cambió. Por eso cada `add` o `update` se revisa antes de aceptarlo, como pide la sección de comandos.

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
| `playwright-cli` | `allowed-tools`: `Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)` | Cualquier comando `npm` o `npx`, no solo los de Playwright, incluidos `npm install` y `npm i`; `npm publish` sí pide confirmación, porque la regla `ask` de `.claude/settings.json` prevalece. Solo actúa en Claude Code, porque Codex no aplica la cabecera. |
| `impeccable` | Hooks `PostToolUse` y `Stop` que su instalador escribe en `.claude/settings.json` y `.codex/hooks.json` | Ejecutan `scripts/impeccable hook` tras cada edición y al cerrar el turno. El lanzador ejecuta el primer motor que encuentra: el de `IMPECCABLE_BIN`, uno junto al lanzador, `~/.impeccable/bin/impeccable`, el de la versión de `scripts/VERSION` en `~/.impeccable/bin/<versión>/` o un `impeccable` del `PATH`; el de `~/.impeccable/bin/impeccable` y el del `PATH` solo tienen que responder a su sonda, sin versión fijada ni hash verificado. Si no encuentra ninguno, descarga el de esa versión a `~/.impeccable/bin/<versión>/` y lo verifica con su `.sha256` (en Windows, a `%USERPROFILE%\.impeccable\bin\<versión>\`, o bajo `IMPECCABLE_HOME` si está definido); los dos los toma de las releases de `pbakaus/impeccable` en GitHub, o de `IMPECCABLE_DOWNLOAD_BASE` si está definido, así que esa variable decide qué binario se ejecuta. Claude Code los ejecuta sin aprobación; Codex, tras aprobarlos, como explica [Hooks de agentes](92-agent-hooks.md). Su paquete de npm no tiene atestación de procedencia: la licencia y el origen que constan en [STACK.md](../STACK.md) son los que declara el propio paquete, y se aceptan con ese riesgo. |

## Navegador operado por el agente

Los dos clientes cargan `playwright-cli` desde `.agents/skills/`: Codex busca ahí las skills del repositorio y Claude Code llega a través del symlink `.claude/skills`. La capacidad queda configurada en ambos con el lanzador de la sección siguiente, y `17-validation-policy.md` solo la exige cuando `PLAN.md` la adopta. En Windows, Claude Code llega a la skill solo si el symlink existe, como explica la sección de ubicación. El sandbox del cliente puede impedir que arranque el navegador; los casos conocidos por sistema están en [Sandbox de agentes](91-agent-sandbox.md).

## Lanzador del navegador

Los agentes no llaman a `playwright-cli` directamente: cada comando de la skill se ejecuta como `node .scripts/browser.mjs <comando> [argumentos]`, con las mismas opciones, por ejemplo `node .scripts/browser.mjs -s=<sesión> open <url>`. El lanzador ejecuta el comando `cli` del paquete `playwright` en la versión que fija Template Tooling de [STACK.md](../STACK.md), siempre desde la raíz del repositorio, así que no necesita un binario global ni depende de la carpeta desde la que se lance. Abre el Chrome instalado en el equipo; si no hay ninguno, instalar un navegador es añadir un binario bajo `07-dependencies-and-binaries.md`, fuera del lanzador. En un proyecto que tiene Playwright como dependencia, sus pruebas siguen usando la versión de su lockfile: el lanzador solo sirve a las sesiones del agente, y un proyecto sin superficie web no lo usa nunca.

Como corre fuera del sandbox, el lanzador no ejecuta nada que un comando confinado pueda haber cambiado, salvo los scripts de `.scripts/`, como explica [Sandbox de agentes](91-agent-sandbox.md). Instala Playwright con npm, la primera vez y en cada cambio de versión, en una caché propia de cada persona fuera del repositorio y del temporal del sistema (`~/Library/Caches/agent-browser/` en macOS, `$XDG_CACHE_HOME/agent-browser/` o `~/.cache/agent-browser/` en Linux y `%LOCALAPPDATA%\agent-browser\` en Windows), lanzando npm desde esa carpeta para que no aplique ninguna configuración de npm del proyecto; por eso no usa `.temp/npm-cache` ni `run-pinned.mjs`. Exige que `.playwright/cli.config.json` contenga exactamente `{"outputDir": ".temp/playwright-cli"}` y que ni esa configuración ni `.temp/playwright-cli` sean enlaces simbólicos, y antes de lanzar nada vuelve a leer los argumentos con el analizador de la propia CLI instalada: si leyera otro comando que el comprobado, no la ejecuta.

Solo deja pasar los comandos que manejan la página y las opciones que su ayuda documenta para cada uno: navegar, interactuar, leerla y emularla, su almacenamiento, su red, la consola, las trazas, los vídeos y las capturas. Rechaza sin ejecutar nada los que ejecutan código fuera del navegador (`run-code`), instalan (`install`, `install-browser`), entregan archivos locales a la página (`upload`, `drop`), se conectan a otro navegador o perfil o cambian su configuración (`attach`, `--config`, `--cdp`, `--endpoint`, `--extension`, `--profile`), cierran sesiones ajenas (`close-all`, `kill-all`) o abren otros servicios (`show`); las direcciones que no son `http`, `https` ni `about:blank`; los nombres de sesión que no son solo letras, dígitos, `-` y `_`, y cualquier archivo que nombre (`--filename` o un argumento de `state-load`, `state-save` y `video-start`) que no sea una ruta relativa dentro del repositorio, sin `..` ni enlaces simbólicos. Un comando rechazado se ejecuta, en la misma versión, con `node .scripts/run-pinned.mjs playwright cli <comando>`, dentro del sandbox o con la aprobación puntual del cliente.

Sus snapshots y trazas van a `.temp/playwright-cli/`: lo fija `outputDir` en `.playwright/cli.config.json`, que la herramienta carga desde la raíz, donde la ejecuta el lanzador. Como todo artefacto de tarea bajo `.temp/` fuera de `.temp/plans/`, se borran al cerrar la tarea, según `06-commands-and-local-runtime.md`.

## Planes de cambio con `prompt-plan`

`/prompt-plan <borrador>` aplica la skill `prompt` y, con el prompt ya revisado, escribe un plan `<AAAA-MM-DD>-<slug>/`, sin copia del prompt ni en el plan ni en el chat, que solo lo recibe cuando no se crea plan, y con las correcciones y hallazgos de `prompt` en el informe: en `build/`, un índice que solo tabula los fragmentos y su estado, `rules.md` con los requisitos comunes a todos los cambios, y los fragmentos, pequeños, incrementales y autónomos junto a `rules.md`, cada uno con un comportamiento o un paso preparatorio que se construye y se prueba por sí solo; en `patch/`, los scripts para registrar, aplicar y revertir cada fragmento, y en `check/`, los auxiliares de verificación, copiados sin cambios de `scripts/` de la propia skill, junto a un script de verificación o de medición por fragmento que lo necesite, y la evidencia con el informe en `review/`. Antes lee las instrucciones de agentes y la política documentada del proyecto destino, que prevalecen sobre sus valores por defecto, así que se adapta a cualquier proyecto: el plan va donde esas reglas sitúan los planes de cambio y, si no lo fijan, en una carpeta `plans/` de la ubicación temporal que define la skill `prompt`. Esa ubicación es la que fijan las reglas del proyecto para los artefactos temporales; si no fijan ninguna, la que fija la configuración global del agente; si tampoco, la carpeta temporal propia de la sesión; y solo si no hay ninguna de ellas, la del sistema operativo. El informe señala como riesgo un plan en la carpeta de la sesión o en la del sistema, porque el cliente o el sistema pueden vaciarlas. Dentro del proyecto, el control de versiones tiene que ignorar la ubicación del plan, y una ubicación dentro de otro repositorio no vale; en esos casos pregunta dónde ponerlo. Si el plan queda fuera del proyecto, el informe da su ruta y sus scripts se ejecutan desde la raíz del proyecto. Esas reglas nunca relajan sus confirmaciones: no ejecuta fragmentos ni los scripts de `patch/`, no borra planes, no cambia las reglas de ignorado ni hace commit, push o deploy sin que se le pida. Solo crea plan para prompts de implementación. Antes de entregar el plan, y antes de ejecutar un fragmento añadido después, ensaya cada script de verificación y de medición que añaden con `--dry-run` sobre el árbol actual, para comprobar que mide lo que debe: fallan las líneas que miden el cambio y pasan las que protegen lo que ya funciona. Para no repetir trabajo lento, el script `all`, que ejecuta las verificaciones hasta el fragmento NN, omite las líneas lentas de los fragmentos anteriores, como las del navegador, salvo con `--slow`, que usan el fragmento que cambia lo que mide una de esas líneas y el de cierre; y un comando que varias verificaciones necesitan, como una compilación, se ejecuta una sola vez por ejecución de `all` si termina bien. Un fragmento que solo mide una línea base lleva un script de medición que `all` no repite y cuya evidencia leen las verificaciones posteriores, y el código que comparten los scripts va en un módulo auxiliar opcional. Solo se invoca a mano: en Claude Code porque su cabecera declara `disable-model-invocation`, y en Codex porque `agents/openai.yaml` declara `allow_implicit_invocation: false`.

En esta plantilla, `06-commands-and-local-runtime.md` sitúa los planes en `.temp/plans/`, que está ignorado, y los exceptúa de la limpieza de `.temp/`, así que se conservan al cerrar la tarea hasta que el usuario los borra. La skill trae esos scripts para Node (`.mjs`), escritos para Windows, macOS y Linux sin requisitos adicionales, y en un proyecto que no puede ejecutar Node los porta, conservando su comportamiento, a un runtime multiplataforma que el proyecto requiera, o pregunta al usuario si no requiere ninguno.

## Preparar un proyecto con `start`

`/start` en Claude Code, o `$start` en Codex, prepara un proyecto recién creado desde la plantilla, o uno existente que acaba de adoptarla como explica [Adopción de versiones de la plantilla](96-template-adoption.md), para empezar o seguir escribiendo código, mediante una conversación en el idioma del usuario y sin herramienta de preguntas: cada pregunta va en el chat con su contexto. En orden, borra los archivos que solo validan la plantilla y añade el remoto `plantilla`, con una aprobación; completa `PRODUCT.md`, `DESIGN.md`, `STACK.md`, `PLAN.md`, el estado del registro de `SECURITY.md` y `README.md`; adapta skills, servidores de herramientas y servidores de lenguaje al stack elegido o ya instalado, con otra aprobación; y termina con los checks de documentación y un informe. Escribe cada sección en cuanto queda decidida, nunca inventa, y lo que el usuario no sabe todavía queda como `TODO` con su entrada en el registro de decisiones abiertas. No escribe código, no instala el stack y no hace commits.

Se puede relanzar en cualquier momento: deduce el avance de los propios archivos, por los marcadores que quedan, las entradas de los registros de decisiones abiertas, las skills anotadas en `STACK.md`, los archivos de la plantilla presentes y el remoto, y sigue donde se quedó. En la plantilla mantenida no cambia nada: explica cómo crear un proyecto o adoptarla en uno existente, como indica [Adopción de versiones de la plantilla](96-template-adoption.md). Se conserva en los proyectos derivados, y también sirve tras adoptar una versión que añade secciones a los esqueletos. Solo se invoca a mano, como `prompt-plan`.

Las skills `commit`, `prompt`, `prompt-plan`, `start`, `security-audit`, `impeccable`, `playwright-cli` y `context7-mcp` son la base de la plantilla y retirarlas es una desviación. Las demás dependen del stack: un proyecto puede retirarlas con `skills remove` sin que cuente como desviación, o conservarlas anotando la decisión en la columna Notes de su fila en `STACK.md`.

## Problema conocido: skills omitidas

Cuando el CLI avisa `Multiple current paths match these skills from <origen>`, omite esa skill en lugar de borrar o migrar la equivocada. Ocurre porque el symlink `.claude/skills` hace que la misma skill resuelva en dos rutas. La skill omitida queda intacta y sigue funcionando con la versión que tenía fijada. Hoy le ocurre a `impeccable`, que se actualiza como indica la sección siguiente.

## Actualizar Impeccable

`impeccable` se actualiza con su propio CLI y después se reinstala desde su origen para refrescar su hash en `skills-lock.json`:

```bash
# Actualizar la skill y regenerar sus agentes y hooks
node .scripts/run-pinned.mjs impeccable update --project --yes --force

# Reinstalar la skill desde su origen y refrescar su hash en el lockfile
node .scripts/run-pinned.mjs skills add pbakaus/impeccable --skill impeccable --agent codex --copy --yes --full-depth
```

`--agent codex --copy` instala solo en `.agents/skills/`, que es la ruta real, y así evita la ambigüedad del symlink. El primer paso deja el binario del motor dentro de la skill y el segundo lo retira: el lanzador `scripts/impeccable` lo descarga y verifica en la caché del usuario, `~/.impeccable/bin/<versión>/`, la primera vez que se ejecuta.

Tras el segundo paso, `node .scripts/run-pinned.mjs impeccable check` avisa `Updates available` aunque no exista una versión nueva: la copia del origen difiere de la que genera el CLI de Impeccable, que adapta rutas y comandos a Claude Code. Ese aviso no sirve para saber si hay una actualización.

El instalador escribe además estos archivos fuera de la skill:

- `.claude/agents/impeccable-*.md`: agentes de Claude Code generados; se versionan.
- `.codex/hooks.json`: hook de diseño de Codex; se versiona.

El hook de diseño de Claude Code se versiona en `.claude/settings.json` para que llegue a los proyectos derivados. El instalador lo reconoce ahí y no crea `.claude/settings.local.json`; si una máquina conserva una copia anterior en ese archivo, Claude Code ejecuta el hook duplicado una sola vez.

## Seguridad durante el desarrollo

`32-security-review-workflow.md` exige consultar guía de seguridad antes de implementar, revisar los avisos después de editar y comprobar el diff de la tarea antes de terminar. La skill configurada es [Cloudflare `security-audit`](https://github.com/cloudflare/security-audit-skill), compartida por Claude Code y Codex mediante `.agents/skills/security-audit/` y el symlink `.claude/skills`.

Se adoptó un commit publicado por Cloudflare, con licencia MIT; `skills-lock.json` guarda su hash de contenido. No declara `allowed-tools`, hooks ni dependencias externas de runtime: incluye documentación y validadores de Node sin paquetes externos. Los validadores de la auditoría completa no se ejecutan como parte del aviso al editar; sus tests sí forman parte de los checks de la plantilla. No funcionan en Windows: rechazan cualquier entrada cuando Node no ofrece `O_NOFOLLOW` y `O_NONBLOCK`, así que allí esos checks omiten sus tests y la auditoría completa no puede validar sus informes. Los checks de la plantilla comprueban el `computedHash` de esta skill con el algoritmo de la versión del CLI `skills` que fija [STACK.md](../STACK.md): SHA-256 de cada nombre relativo portable y sus bytes, ordenados con `localeCompare`. La copia adicional de `LICENSE`, procedente de la raíz del upstream y ausente de su carpeta de skill, se excluye de ese hash y se verifica por separado con su checksum adoptado en `check-security-skill.mjs`. Este gate cubre `security-audit`, no todas las skills del lockfile, y solo corre en la plantilla: un proyecto derivado recibe la skill ya verificada. Adoptar una versión posterior sigue la aprobación y revisión de permisos de las reglas de dependencias y tooling.

Durante la construcción se usa su **guidance mode**: leer las secciones necesarias, aplicar sus criterios a las decisiones y hacer una revisión focalizada del diff. No se inicia automáticamente su auditoría de seis fases ni se generan sus informes. El hook propio `Checking security patterns` solo aporta candidatos locales; el agente confirma su contexto con la skill. No ejecuta el código revisado, no llama a un modelo separado, no envía archivos a un servicio adicional y no modifica los archivos detectados.

La revisión final incluye los commits creados durante la tarea, los cambios preparados y sin preparar y los archivos nuevos dentro del alcance. La revisión independiente, cuando se exige, incorpora seguridad a la misma ronda de `31-verification-loop.md`. Los avisos por edición no cuentan como rondas independientes. Las reproducciones de seguridad siguen los requisitos de aislamiento de la skill; si el harness no puede proporcionar todos, se limita la revisión a código fuente y se informa lo pendiente sin afirmar validación dinámica.

Una auditoría completa requiere petición explícita y comprobar antes que su metodología, presupuesto, artefactos y múltiples verificadores sean compatibles con los límites autorizados del repositorio. Esta instalación no amplía esos límites. Los hallazgos persistentes se registran donde indiquen las reglas de documentación; no se crea un registro paralelo para la revisión cotidiana.

## Flujo de diseño y revisión de UI

`13-ui-design-workflow.md` define cuándo se diseña, critica, audita y refina una interfaz. Impeccable es la skill configurada para ejecutar esas revisiones en Claude Code y Codex. La secuencia es diseño previo → implementación con detectores → `critique` → `audit` cuando corresponda → `polish` si hay hallazgos visuales → verificación final.

| Etapa | Ejecución con Impeccable |
| --- | --- |
| Diseño previo | Consultar `PRODUCT.md`, `DESIGN.md` y la interfaz existente. Seguir `reference/new-work.md` para UI nueva o rediseñada y registrar jerarquía, distribución, interacción y estados en la especificación de la tarea. En ajustes pequeños, registrar lo que se preserva. `shape` queda disponible si la tarea requiere descubrimiento de UX; no se añade una entrevista a cada ajuste. |
| Implementación | Mantener los hooks `Checking UI changes` y `Design deep pass`. Son el detector automático; no equivalen a una crítica ni a una auditoría del producto. |
| Crítica | Ejecutar el procedimiento `$impeccable critique` una vez por tarea que cambie UI, incluidos estilos y textos. Resolver objetivos concretos y cubrir todas las superficies afectadas; pueden requerirse varios objetivos dentro de la misma ronda. |
| Auditoría | Ejecutar `$impeccable audit` cuando los criterios de aceptación entreguen una pantalla o flujo funcional completo, nuevo o modificado. Usar su referencia nativa cuando corresponda y limitar el informe a las superficies afectadas. |
| Refinamiento | Ejecutar `$impeccable polish` cuando los hallazgos requieran correcciones visuales dentro del alcance autorizado. Conservar identidad, contenido y comportamiento; no convertir el refinamiento en un rediseño. |
| Confirmación | Comprobar las correcciones sobre la experiencia renderizada y repetir los checks afectados. Reutilizar evidencia aún válida y respetar el límite de rondas de la regla; no repetir revisiones completas indefinidamente. |

`critique`, `audit` y `polish` son procedimientos de la skill, no nuevos hooks ni subcomandos shell equivalentes. Antes de ejecutarlos se leen sus referencias: [critique](../.agents/skills/impeccable/reference/critique.md), [audit](../.agents/skills/impeccable/reference/audit.md), [audit nativo](../.agents/skills/impeccable/reference/audit.native.md) y [polish](../.agents/skills/impeccable/reference/polish.md). El lanzador `scripts/impeccable` proporciona contexto, detector y almacenamiento de informes; por sí solo no ejecuta la evaluación de diseño del agente.

La crítica prescribe dos evaluaciones aisladas: diseño y evidencia del detector/navegador. Cuando `31-verification-loop.md` exige verificación independiente, se coordinan en la etapa de revisión de UI, después de pasar los demás checks de implementación, como una sola ronda sobre la especificación y el diff, con acceso al repositorio y sin compartir hallazgos antes de la síntesis. Se respetan las autorizaciones de la skill y de `03-approval-boundaries.md`; esta política no preautoriza subagentes ni amplía permisos. Las observaciones del detector son evidencia complementaria, no prueba de que la experiencia esté validada.

Se reúnen los hallazgos de crítica y auditoría antes de corregirlos; los que excedan el alcance se informan. El refinamiento consume esos hallazgos y no inicia otra verificación independiente. La ausencia de navegador, detector u otra capacidad se declara según las reglas de fuentes y validación, sin afirmar una revisión completa. Una tarea sin cambios de UI no activa este flujo. Los hooks globales no incorporan estas obligaciones: se heredan a través de las instrucciones compartidas del repositorio.

## Impeccable, `PRODUCT.md` y `DESIGN.md`

Los esqueletos de `PRODUCT.md` y `DESIGN.md` siguen el formato que leen y escriben las referencias `init` y `document` de Impeccable (`reference/init.md` y `reference/document.md` de la skill), para que la skill los actualice en lugar de crear una autoridad paralela:

- `PRODUCT.md` lleva el marcador `impeccable:product-schema` y las secciones de `init` en su orden; `DESIGN.md`, el frontmatter de tokens y las ocho secciones canónicas del formato DESIGN.md. Detrás van las secciones propias de la plantilla, que la skill conserva.
- Los encabezados, las claves del frontmatter y el marcador van en inglés, y el contenido en español, como fija `15-language-and-naming.md`.
- El frontmatter de `DESIGN.md` es la fuente normativa de los tokens que su esquema admite (colores, tipografía, radios, espaciado y componentes), como fija `12-ui-theming-and-tokens.md`. El stack vive en Selected Stack de [STACK.md](../STACK.md), como fija `33-stack-register.md`, y la sección `Stack` de `PRODUCT.md` solo enlaza a él. `init` solo escribe `Stack` en un proyecto nuevo: lo que proponga se registra en `STACK.md` y deja en `PRODUCT.md` solo el enlace. Si falta esa sección de `STACK.md`, manda el stack instalado, como define `04-sources-and-skills.md`.
- Los tokens que el esquema no admite, como sombras, movimiento o puntos de corte, los fija el código y los describe su sección de `DESIGN.md`; el complemento `design.json` solo los refleja.
- Si `init` o `document` proponen contenido que ya tiene sitio en una sección propia de la plantilla, como la terminología, las métricas de éxito, las decisiones abiertas, la voz del contenido o el estándar de accesibilidad, ese contenido va a esa sección y no se duplica; las restricciones de runtime y versión van a `STACK.md` y las demás restricciones técnicas, a `PLAN.md`.
- Mientras `Platform` conserve su `TODO`, `impeccable context` avisa de que no reconoce el valor y trata el proyecto como `web`. El aviso desaparece al escribir `web`, `ios`, `android` o `adaptive`.

En `.impeccable/`, `config.json` guarda la configuración compartida y se versiona. `design.json` es el complemento de `DESIGN.md` que `document` regenera con él: el CLI no lo excluye, así que se versiona junto a `DESIGN.md` y nunca se edita a mano, como pide `14-code-authoring.md`. `config.local.json` guarda los ajustes de cada persona y `.gitignore` lo ignora, así que no se versiona. También se versionan `critique/ignore.md`, las supresiones que `critique` vuelve a leer en cada ejecución (`reference/critique.md`), y `live/config.json`, la configuración del modo live (`reference/live-setup.md`). El resto son artefactos de trabajo que `.gitignore` ignora: las maquetas de `mocks/`, incluidas las descartadas, que no implican aprobación (`reference/new-work.md`); las capturas y medidas de `review/` y `build/`; los informes de `critique/`, que se entregan en la conversación; y los archivos de ejecución de `live/`.
