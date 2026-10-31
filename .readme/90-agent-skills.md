# Skills de agentes

Las skills de agentes se versionan en este repositorio bajo `.agents/skills/`. La base de la plantilla son cinco: `commit`, `prompt`, `prompt-plan` y `start`, propias de la plantilla, que no figuran en el lockfile y se editan directamente en `.agents/skills/`, y `security-audit`, que se instala desde un repositorio público y que `skills-lock.json`, en la raíz, fija a su origen y a un hash de integridad. Las reglas y los documentos de la plantilla se apoyan en ellas, así que retirar una es una desviación. Las demás skills dependen del stack y forman el [catálogo opcional](#catálogo-opcional), que un proyecto instala cuando las necesita.

## Herramienta

Las gestiona el CLI [`vercel-labs/skills`](https://github.com/vercel-labs/skills), que se ejecuta con `npx` sin instalarse como dependencia del proyecto. Los comandos de este documento lo ejecutan con `node .scripts/run-pinned.mjs`, que toma la versión fijada de Template Tooling en [stack.md](../.docs/stack.md), donde también consta su procedencia; cambiarla es una actualización que `06-dependencies-and-stack.md` somete a aprobación.

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

Tras `add` o `update`, y antes de invocar la skill o dar el cambio por bueno, revisa `git diff HEAD -- ".agents/skills/*/SKILL.md"` en sus cabeceras `allowed-tools` y `hooks`, y lo que el instalador haya escrito en `.claude/settings.json` o `.codex/hooks.json`. Lo que exceda los permisos del repositorio es una decisión abierta bajo las reglas de aprobación de `AGENTS.md`, y lo aceptado se registra en la sección de permisos de este archivo. Si `update` alcanza a `security-audit`, restaura además la licencia que la plantilla le añade, que el CLI borra al reinstalar la carpeta: `git restore --source=HEAD -- .agents/skills/security-audit/LICENSE`.

## Cómo funciona la actualización

El comando resuelve el alcance, lee `skills-lock.json`, descarga los hashes remotos para compararlos, identifica las desactualizadas, reinstala las que cambiaron y reescribe el lockfile. Una skill sin cambios no se toca.

Ninguna skill se fija a un commit con `ref`: por decisión del usuario, `update` trae siempre la última versión publicada y el hash solo detecta que cambió. Por eso cada `add` o `update` se revisa antes de aceptarlo, como pide la sección de comandos.

`computedHash` se calcula sobre el contenido **remoto** en el momento de la instalación, no sobre el archivo local, así que un `sha256` del `SKILL.md` de este repositorio no coincidirá con él.

## Ubicación

Las skills viven en `.agents/skills/`. El directorio `.claude/skills` es un symlink a esa ruta para que el cliente de Claude las descubra.

### Symlink en Windows

En Windows, Git solo crea el symlink si tiene permiso para hacerlo. Hay que activar el Modo de desarrollador de Windows, o trabajar como administrador, y clonar con `git clone -c core.symlinks=true <url>`. En un clon hecho sin eso, `.claude/skills` es un archivo de texto con la ruta de destino y Claude Code no encuentra las skills. El hook de symlinks lo avisa en cada mensaje, como explica [Hooks de agentes](92-agent-hooks.md).

Para arreglar un clon existente, activa el Modo de desarrollador, ejecuta `git config core.symlinks true`, borra el archivo `.claude/skills` y restáuralo con `git checkout -- .claude/skills`.

## Permisos que se conceden las skills

Una skill puede preaprobar herramientas en la cabecera `allowed-tools` de su `SKILL.md`: durante el turno en que se invoca, Claude Code ejecuta esos comandos sin pedir permiso, aunque la carpeta no tenga aceptada la confianza, y la concesión caduca con el siguiente mensaje. Las reglas `ask` y `deny` de `.claude/settings.json` prevalecen sobre esa cabecera, y Codex no la aplica. El instalador de una skill puede además escribir hooks en la configuración de los clientes.

`13-agent-tooling.md` exige revisar ambas cosas antes de invocar o aceptar una skill nueva o actualizada, y registrar aquí lo aceptado. `.claude/settings.json` no declara reglas `allow` en `permissions`, así que cualquier preaprobación excede los permisos del repositorio y es una decisión abierta bajo las reglas de aprobación de `AGENTS.md`. Ninguna skill de la base declara `allowed-tools` ni hooks, y todos los hooks de `.claude/settings.json` y `.codex/hooks.json` son del repositorio, así que la base no tiene concesiones que registrar. Las de las skills del catálogo constan en la tabla de [Concesiones aceptadas](#concesiones-aceptadas).

## Catálogo opcional

La plantilla no instala las skills que dependen del stack. Un proyecto instala desde su origen las que su stack necesita:

| Skill | Origen | Cuándo instalarla |
| --- | --- | --- |
| `cloudflare` | `cloudflare/skills` | El proyecto se despliega en Cloudflare o debe elegir entre sus productos de cómputo, almacenamiento, red o seguridad. |
| `wrangler` | `cloudflare/skills` | El proyecto usa Wrangler, el CLI de Cloudflare, para ejecutar Workers en local, previsualizarlos, desplegarlos o gestionar sus recursos. |
| `workers-best-practices` | `cloudflare/skills` | El proyecto escribe, revisa o configura Cloudflare Workers. |
| `nuxt` | `antfu/skills` | El proyecto usa Nuxt: rutas de servidor, `useFetch`, middleware o renderizado híbrido. |
| `vue` | `antfu/skills` | El proyecto usa Vue 3: Composition API, macros de `<script setup>`, reactividad y componentes integrados. |
| `nuxt-ui` | `nuxt/ui` | El proyecto usa `@nuxt/ui` como librería de componentes. |
| `vue-best-practices` | `vuejs-ai/skills` | El proyecto usa Vue con TypeScript, SSR, Vue Router, Pinia o Vite. |
| `vueuse-functions` | `vueuse/skills` | El proyecto usa VueUse en Vue 3 o Nuxt 3 o posterior. |
| `frontend-design` | `anthropics/skills` | El proyecto tiene interfaz y necesita criterios de dirección estética y tipografía. |
| `playwright-cli` | `microsoft/playwright-cli` | El proyecto adopta la verificación en navegador por el agente que registra `.docs/plan.md`, cuyas sesiones lanza el [lanzador del navegador](#lanzador-del-navegador). |
| `context7-mcp` | `upstash/context7` | El proyecto consulta con el servidor `context7` la documentación de sus librerías, como explica [Servidores de herramientas de agentes](95-agent-tool-servers.md). |

Se instalan con el mismo CLI y el mismo script que el resto de comandos:

```bash
# Instalar una skill del catálogo
node .scripts/run-pinned.mjs skills add <origen> --skill <nombre> --agent codex --copy --yes

# Por ejemplo
node .scripts/run-pinned.mjs skills add cloudflare/skills --skill wrangler --agent codex --copy --yes
```

`--skill <nombre>` instala solo esa skill del repositorio de origen, que puede publicar varias. `--agent codex --copy` instala solo en `.agents/skills/`, que es la ruta real, y así evita la ambigüedad del symlink que describe [Problema conocido: skills omitidas](#problema-conocido-skills-omitidas). `--yes` omite los prompts. Antes de invocar la skill, se revisan sus permisos como pide la sección de comandos. El CLI añade su entrada a `skills-lock.json` y el hook de `.docs/stack.md` la incorpora a su inventario de skills.

Retirar una skill del catálogo con `skills remove` no cuenta como desviación. Una que el stack no usa y se conserva lleva la decisión anotada en la columna Notes de su fila en `.docs/stack.md`.

La base no trae una capacidad de revisión de diseño. `07-interface.md` pide la crítica y la auditoría de una interfaz con la capacidad de revisión que el proyecto configure; si adopta una skill para ello, la instala y registra sus concesiones como cualquier otra.

### Concesiones aceptadas

Esta tabla recoge las concesiones aceptadas de las skills del catálogo, que heredan los proyectos derivados que las instalan. Una skill del catálogo que no figura en ella no tiene ninguna aceptada: si su cabecera declara `allowed-tools` o su instalador escribe hooks, es una decisión abierta, y si los de una skill dejan de coincidir con su fila, lo nuevo no está aceptado y hay que revisarlo.

| Skill | Concesión | Alcance real |
| --- | --- | --- |
| `playwright-cli` | `allowed-tools`: `Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)` | Cualquier comando `npm` o `npx`, no solo los de Playwright, incluidos `npm install` y `npm i`; `npm publish` sí pide confirmación, porque la regla `ask` de `.claude/settings.json` prevalece. Solo actúa en Claude Code, porque Codex no aplica la cabecera. |

## Navegador operado por el agente

El agente necesita la skill `playwright-cli` del catálogo para manejar el navegador. Una vez instalada, los dos clientes la cargan desde `.agents/skills/`: Codex busca ahí las skills del repositorio y Claude Code llega a través del symlink `.claude/skills`. La plantilla deja configurado en ambos el lanzador de la sección siguiente, y `07-interface.md` solo exige la verificación en el navegador cuando `.docs/plan.md` adopta la capacidad. En Windows, Claude Code llega a la skill solo si el symlink existe, como explica la sección de ubicación. El sandbox del cliente puede impedir que arranque el navegador; los casos conocidos por sistema están en [Sandbox de agentes](91-agent-sandbox.md).

## Lanzador del navegador

Los agentes no llaman a `playwright-cli` directamente, como pide `07-interface.md`: cada comando de la skill se ejecuta como `node .scripts/browser.mjs <comando> [argumentos]`, con las mismas opciones, por ejemplo `node .scripts/browser.mjs -s=<sesión> open <url>`. El lanzador ejecuta el comando `cli` del paquete `playwright` en la versión que fija Template Tooling de [stack.md](../.docs/stack.md), siempre desde la raíz del repositorio, así que no necesita un binario global ni depende de la carpeta desde la que se lance. Abre el Chrome instalado en el equipo; si no hay ninguno, instalar un navegador es añadir un binario bajo `06-dependencies-and-stack.md`, fuera del lanzador. En un proyecto que tiene Playwright como dependencia, sus pruebas siguen usando la versión de su lockfile: el lanzador solo sirve a las sesiones del agente, y un proyecto sin superficie web no lo usa nunca.

Como corre fuera del sandbox, el lanzador no ejecuta nada que un comando confinado pueda haber cambiado, salvo los scripts de `.scripts/`, como explica [Sandbox de agentes](91-agent-sandbox.md). Instala Playwright con npm, la primera vez y en cada cambio de versión, en una caché propia de cada persona fuera del repositorio y del temporal del sistema (`~/Library/Caches/agent-browser/` en macOS, `$XDG_CACHE_HOME/agent-browser/` o `~/.cache/agent-browser/` en Linux y `%LOCALAPPDATA%\agent-browser\` en Windows), lanzando npm desde esa carpeta para que no aplique ninguna configuración de npm del proyecto; por eso no usa `.temp/npm-cache` ni `run-pinned.mjs`. Exige que `.playwright/cli.config.json` contenga exactamente `{"outputDir": ".temp/playwright-cli"}` y que ni esa configuración ni `.temp/playwright-cli` sean enlaces simbólicos, y antes de lanzar nada vuelve a leer los argumentos con el analizador de la propia CLI instalada: si leyera otro comando que el comprobado, no la ejecuta.

Solo deja pasar los comandos que manejan la página y las opciones que su ayuda documenta para cada uno: navegar, interactuar, leerla y emularla, su almacenamiento, su red, la consola, las trazas, los vídeos y las capturas. Rechaza sin ejecutar nada los que ejecutan código fuera del navegador (`run-code`), instalan (`install`, `install-browser`), entregan archivos locales a la página (`upload`, `drop`), se conectan a otro navegador o perfil o cambian su configuración (`attach`, `--config`, `--cdp`, `--endpoint`, `--extension`, `--profile`), cierran sesiones ajenas (`close-all`, `kill-all`) o abren otros servicios (`show`); las direcciones que no son `http`, `https` ni `about:blank`; los nombres de sesión que no son solo letras, dígitos, `-` y `_`, y cualquier archivo que nombre (`--filename` o un argumento de `state-load`, `state-save` y `video-start`) que no sea una ruta relativa dentro del repositorio, sin `..` ni enlaces simbólicos. Un comando rechazado se ejecuta, en la misma versión, con `node .scripts/run-pinned.mjs playwright cli <comando>`, dentro del sandbox o con la aprobación puntual del cliente.

Sus snapshots y trazas van a `.temp/playwright-cli/`: lo fija `outputDir` en `.playwright/cli.config.json`, que la herramienta carga desde la raíz, donde la ejecuta el lanzador. Como todo artefacto de tarea bajo `.temp/` fuera de `.temp/plans/`, se borran al cerrar la tarea, según `AGENTS.md`.

## Planes de cambio con `prompt-plan`

`/prompt-plan <borrador>` en Claude Code, o `$prompt-plan <borrador>` en Codex, aplica la skill `prompt` y, con el prompt ya revisado, escribe, solo para prompts de implementación, un plan de cambio en fragmentos pequeños, incrementales y autónomos, con scripts para registrar, aplicar, revertir y verificar cada uno. Antes lee las instrucciones del proyecto destino, que prevalecen sobre sus valores por defecto, y nunca ejecuta fragmentos, borra planes, cambia reglas de ignorado ni hace commit, push o deploy sin que se le pida. La estructura del plan, su ubicación cuando el proyecto no la fija, el ensayo de las verificaciones, los ciclos de corrección y la renumeración los define [la skill](../.agents/skills/prompt-plan/SKILL.md) con sus referencias. Solo se invoca a mano: en Claude Code porque su cabecera declara `disable-model-invocation`, y en Codex porque `agents/openai.yaml` declara `allow_implicit_invocation: false`.

En esta plantilla, `AGENTS.md` y `02-change-workflow.md` sitúan los planes en `.temp/plans/`, que está ignorado, y `AGENTS.md` los exceptúa de la limpieza de `.temp/`, así que se conservan al cerrar la tarea hasta que el usuario los borra. La skill trae esos scripts para Node (`.mjs`), escritos para Windows, macOS y Linux con Node 18 o posterior; los scripts de `patch/` requieren además git 2.25 o posterior, y comprueban ambas versiones al empezar. Sus instantáneas guardan los objetos que escriben en `patch/objects/` del propio plan, donde `git gc` no los poda. Esas instantáneas solo leen los archivos versionados y los que el agente adopta con `record NN after --include`, y, sin guardarlo, para saber qué fragmentos están aplicados, el archivo sin versionar que esté en una ruta que un fragmento registró, así que ningún parche ni objeto suyo copia un archivo sin versionar, ignorado o no, que nadie adoptó. `after` no registra mientras quede un archivo nuevo sin ignorar que no se adoptó ni se dejó fuera con `--leave`, y `--include` rechaza el archivo que el árbol de trabajo ya tenía con ese nombre en el registro `before`, así que está pensado para lo que escribe el propio fragmento, también si lo redactó en otro sitio, como la ubicación temporal. Sacar del índice un archivo que sigue en disco, como hacen `git rm --cached`, `git reset` o un commit que deja de seguirlo, queda fuera del plan: los registros lo rechazan hasta que `git add` lo vuelve a seguir, y ese cambio se hace después del cierre; el archivo que un fragmento quitó con `git rm` y un build volvió a escribir se borra antes de registrarlo, y después cuenta por lo que contiene si así encaja algún punto de la secuencia de fragmentos, y si no, como ausente. Tampoco corren con `core.ignorecase` en false o sin definir, que git lee como false, en un sistema de archivos que no distingue mayúsculas, donde git y el disco no coinciden en qué nombres existen, hasta que `git config core.ignorecase true` lo deja como git lo pone en ese sistema. Un fragmento terminado no se vuelve a registrar: lo que le falte va a un fragmento nuevo. En Windows, las comprobaciones lanzan cada comando con cmd.exe en una sola línea con todo entre comillas, y dan por fallida, sin ejecutarla, la línea cuyo comando o argumento contiene `"`, `%`, `!` o un salto de línea, que cmd.exe no pasa literalmente. En un proyecto que no puede ejecutar Node los porta, conservando su comportamiento, a un runtime multiplataforma que el proyecto requiera, o pregunta al usuario si no requiere ninguno.

## Preparar un proyecto con `start`

`/start` en Claude Code, o `$start` en Codex, prepara un proyecto recién creado desde la plantilla, o uno existente que acaba de adoptarla como explica [Adopción de versiones de la plantilla](96-template-adoption.md), para empezar o seguir escribiendo código, mediante una conversación en el idioma del usuario y sin herramienta de preguntas: cada pregunta va en el chat con su contexto. En orden, borra los archivos que solo validan la plantilla y añade el remoto `plantilla`, con una aprobación; completa `.docs/product.md`, `.docs/design.md`, `.docs/stack.md`, `.docs/plan.md`, el estado del registro de `.docs/security.md` y `README.md`, y registra en `.docs/backlog.md` lo que queda pendiente; adapta skills, servidores de herramientas y servidores de lenguaje al stack elegido o ya instalado, con otra aprobación; y termina con los checks de documentación y un informe. Escribe cada sección en cuanto queda decidida, nunca inventa, y lo que el usuario no sabe todavía queda como `TODO` con su entrada en `.docs/backlog.md`. No escribe código, no instala el stack y no hace commits.

Se puede relanzar en cualquier momento: deduce el avance de los propios archivos, por los marcadores que quedan y las entradas de `.docs/backlog.md` a las que remiten, las skills instaladas y las conservadas en `.docs/stack.md`, los archivos de la plantilla presentes y el remoto, y sigue donde se quedó. En la plantilla mantenida no cambia nada: explica cómo crear un proyecto o adoptarla en uno existente, como indica [Adopción de versiones de la plantilla](96-template-adoption.md). Se conserva en los proyectos derivados, y también sirve tras adoptar una versión que añade secciones a los esqueletos. Solo se invoca a mano, como `prompt-plan`.

## Problema conocido: skills omitidas

Cuando el CLI avisa `Multiple current paths match these skills from <origen>`, omite esa skill en lugar de borrar o migrar la equivocada. Ocurre porque el symlink `.claude/skills` hace que la misma skill resuelva en dos rutas. La skill omitida queda intacta y sigue funcionando con la versión que tenía fijada. Para actualizarla se reinstala desde su origen con `--agent codex --copy`, como muestra el [catálogo opcional](#catálogo-opcional).

## Seguridad durante el desarrollo

`08-security-and-data.md` exige consultar guía de seguridad antes de implementar, revisar los avisos después de editar y comprobar el diff de la tarea antes de terminar. La skill configurada es [Cloudflare `security-audit`](https://github.com/cloudflare/security-audit-skill), compartida por Claude Code y Codex mediante `.agents/skills/security-audit/` y el symlink `.claude/skills`.

Se adoptó un commit publicado por Cloudflare, con licencia MIT; `skills-lock.json` guarda su hash de contenido. No declara `allowed-tools`, hooks ni dependencias externas de runtime: incluye documentación y validadores de Node sin paquetes externos. Los validadores de la auditoría completa no se ejecutan como parte del aviso al editar; sus tests sí forman parte de los checks de la plantilla. No funcionan en Windows: rechazan cualquier entrada cuando Node no ofrece `O_NOFOLLOW` y `O_NONBLOCK`, así que allí esos checks omiten sus tests y la auditoría completa no puede validar sus informes. Los checks de la plantilla comprueban el `computedHash` de esta skill con el algoritmo de la versión del CLI `skills` que fija [stack.md](../.docs/stack.md): SHA-256 de cada nombre relativo portable y sus bytes, ordenados con `localeCompare`. La copia adicional de `LICENSE`, procedente de la raíz del upstream y ausente de su carpeta de skill, se excluye de ese hash y se verifica por separado con su checksum adoptado en `check-security-skill.mjs`. Cuando `update` reinstala la skill porque cambió, borra esa copia: hay que restaurarla desde la raíz del upstream y volver a pasar ese check. Este gate cubre `security-audit`, no las skills del catálogo que un proyecto instale, y solo corre en la plantilla: un proyecto derivado recibe la skill ya verificada. Adoptar una versión posterior sigue la aprobación y revisión de permisos de `06-dependencies-and-stack.md` y `13-agent-tooling.md`.

Durante la construcción se usa su **guidance mode**: leer las secciones necesarias, aplicar sus criterios a las decisiones y hacer una revisión focalizada del diff. No se inicia automáticamente su auditoría de seis fases ni se generan sus informes. El hook propio `Checking security patterns` solo aporta candidatos locales; el agente confirma su contexto con la skill. No ejecuta el código revisado, no llama a un modelo separado, no envía archivos a un servicio adicional y no modifica los archivos detectados.

La revisión final incluye los commits creados durante la tarea, los cambios preparados y sin preparar y los archivos nuevos dentro del alcance. La revisión independiente, cuando se exige, incorpora seguridad a la misma ronda de `05-independent-verification.md`. Los avisos por edición no cuentan como rondas independientes. Las reproducciones de seguridad siguen los requisitos de aislamiento de la skill; si el harness no puede proporcionar todos, se limita la revisión a código fuente y se informa lo pendiente sin afirmar validación dinámica.

Una auditoría completa requiere petición explícita y comprobar antes que su metodología, presupuesto, artefactos y múltiples verificadores sean compatibles con los límites autorizados del repositorio. Esta instalación no amplía esos límites. Los hallazgos persistentes se registran donde indican `08-security-and-data.md` y `10-documents.md`; no se crea un registro paralelo para la revisión cotidiana.
