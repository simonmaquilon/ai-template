# Hooks de agentes

Algunas instrucciones enrutadas se hacen cumplir con hooks de los clientes de agente, además de estar escritas. `28-agent-tooling-configuration.md` exige que cada hook llegue a todos los clientes configurados, o que se declare por qué un cliente queda fuera, y que cite en su mensaje la regla que hace cumplir y conste en este registro; un hook de terceros consta como excepción declarada. Este archivo registra qué hook vive en cada cliente y qué hace falta para que se ejecute.

## Registro

| Hook | Evento | Regla que hace cumplir | Claude Code | Codex |
| --- | --- | --- | --- | --- |
| Rechaza el `git add` y el `git commit` en bloque | `PreToolUse`, sobre `Bash` | `27-version-control.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Avisa de directorios vacíos no ignorados | `UserPromptSubmit` | `05-repo-layout.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Avisa de enlaces y rutas citadas rotos en la documentación | `UserPromptSubmit` | `17-validation-policy.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Avisa tras cada edición de archivos de código que superan el límite de líneas y fuerza una continuación al cerrar el turno | `PostToolUse`, sobre ediciones; `Stop`; y `UserPromptSubmit`, que marca el inicio del turno | `14-code-authoring.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Revisión de diseño de Impeccable | `PostToolUse` y `Stop` | — | `.claude/settings.json` | `.codex/hooks.json` |

Los cuatro primeros usan el mismo comando en los dos clientes, y los que leen archivos se sitúan antes en la raíz del repositorio (`git rev-parse --show-toplevel`), sea cual sea la carpeta en la que esté la sesión. El hook de `git` lee `tool_input.command` como texto o como lista de argumentos, porque los clientes no garantizan la misma forma, y rechaza la llamada saliendo con código 2 y el motivo en stderr. Los de `UserPromptSubmit` imprimen texto plano, que ambos clientes añaden al contexto del modelo, y nunca bloquean. El de enlaces también avisa de las rutas del repositorio citadas entre backticks que ya no existen; qué cuenta como ruta citada lo fija la cabecera de `.scripts/check-doc-links.mjs`.

El de longitud actúa en tres momentos. Al enviar cada mensaje deja una marca por sesión en `.temp/check-file-length/`, con el `session_id` que ambos clientes pasan al hook, y borra las marcas de sesiones sin actividad desde hace una semana. Tras cada edición revisa los archivos que esa edición tocó, también los que se alcanzan a través de un symlink, y, si alguno se pasa, sale con código 2: Claude Code le pasa el motivo al modelo y Codex sustituye con él el resultado de la herramienta, así que el agente divide el archivo en su siguiente paso. Al cerrar el turno revisa los archivos cambiados respecto a `HEAD`, incluidos los que no tienen seguimiento y los que se crearon desde la shell, pero solo los modificados después de la marca de la sesión; sin marca, los revisa todos. Así, el trabajo sin commitear de otra sesión no fuerza continuaciones, salvo que se modifique durante el turno. Si encuentra alguno, hace continuar el turno una sola vez: si el cierre ya viene de una continuación forzada por cualquier hook de `Stop` (`stop_hook_active`), deja terminar. Un archivo que ya pasaba del límite en `HEAD` puede cambiar pero no crecer; uno creado y commiteado dentro del mismo turno ya forma parte de `HEAD` y no se revisa.

El límite lo fija `.scripts/check-file-length.mjs`, y el aviso del hook incluye el número; qué cuenta como código lo fija `.scripts/source-files.mjs`. Un proyecto derivado exime sus archivos generados o vendorizados marcándolos en `.gitattributes` con `linguist-generated` o `linguist-vendored`, como hace la plantilla con `.agents/skills/`, y cualquier otro archivo exento que el script no reconozca, con `-source-file-limit`.

El de Impeccable no hace cumplir ni cita una regla enrutada: lo instala y regenera la skill con un comando distinto por cliente (rutas `.claude/skills` y `.agents/skills`; `commandWindows` solo en Codex), como describe [Skills de agentes](90-agent-skills.md).

## Requisitos

Los hooks de reglas se ejecutan en una shell POSIX y necesitan `git` y `node` en el `PATH`; el de `git` necesita además `jq`. Si falta uno, el hook deja de actuar sin bloquear nada: sin `node` no se comprueban ni los enlaces ni la longitud, y sin `jq` el hook de `git` deja pasar cualquier `git add`. Ninguno declara una variante para Windows.

## Codex: aprobación de los hooks

Codex no ejecuta un hook de proyecto hasta que el usuario lo revisa. Al abrir una sesión con hooks nuevos o modificados muestra un aviso con tres opciones: `Review hooks`, `Trust all and continue` y `Continue without trusting`. Con la última, los hooks quedan desactivados y la sesión sigue sin ellos, sin avisar después.

La aprobación se guarda por hook, como un hash, en la tabla `[hooks.state]` de `~/.codex/config.toml`. Es configuración del usuario y no del repositorio, así que cada máquina y cada persona aprueban por su cuenta.

Cambiar el comando de un hook cambia su hash. Tras adoptar una versión de la plantilla que modifica un hook, Codex vuelve a pedir la aprobación y el hook no se ejecuta hasta darla.

`--dangerously-bypass-hook-trust` ejecuta los hooks sin aprobarlos durante una invocación. No sirve como vía ordinaria: aprobarlos es una decisión sobre qué se ejecuta en la máquina, y `03-approval-boundaries.md` prohíbe sortear un límite de ese tipo.

## Claude Code

Claude Code ejecuta los hooks de `.claude/settings.json` sin aprobación previa. El archivo se versiona para que los hooks, y los plugins que registra [Servidores de lenguaje de agentes](93-agent-language-servers.md), lleguen a los proyectos derivados; un proyecto conserva a su lado sus ajustes propios, como las exenciones de sandbox que registra [Sandbox de agentes](91-agent-sandbox.md).

Dos ajustes de ese archivo solo existen en Claude Code. `attribution`, con `commit` y `pr` vacíos, suprime las líneas de autoría que Claude Code añadiría a commits y PRs, como pide `27-version-control.md`. En Codex esa atribución depende de un ajuste de la cuenta que el cliente consulta al servidor, no de `.codex/config.toml`, así que el repositorio no puede fijarla; si está activa, Codex pide al modelo terminar los commits con `Co-authored-by: Codex`, en contra de la regla escrita. `permissions.defaultMode` fija el modo de permisos de Claude Code; su equivalente en Codex es `approval_policy`, descrito en [Sandbox de agentes](91-agent-sandbox.md), y `.codex/config.toml` no lo fija, así que cada persona conserva el suyo.
