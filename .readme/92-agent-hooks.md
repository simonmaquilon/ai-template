# Hooks de agentes

Algunas instrucciones enrutadas se hacen cumplir con hooks de los clientes de agente, además de estar escritas. `28-agent-tooling-configuration.md` exige que cada hook llegue a todos los clientes configurados, o que se declare por qué un cliente queda fuera, y que cite en su mensaje la regla que hace cumplir y conste en este registro; un hook de terceros consta como excepción declarada. Este archivo registra qué hook vive en cada cliente, cómo se lanza en cada sistema y qué hace falta para que se ejecute, además de los demás ajustes que el repositorio fija en cada cliente.

## Registro

Todos viven en `.claude/settings.json` y en `.codex/hooks.json`.

| Hook | Evento | Regla que hace cumplir | Script |
| --- | --- | --- | --- |
| Rechaza el `git add` y el `git commit` en bloque | `PreToolUse`, sobre la herramienta de shell | `27-version-control.md` | `.scripts/check-staging.mjs` |
| Avisa de directorios vacíos no ignorados | `UserPromptSubmit` | `05-repo-layout.md` | `.scripts/check-empty-dirs.mjs` |
| Avisa de enlaces y rutas citadas rotos en la documentación | `UserPromptSubmit` | `17-validation-policy.md` | `.scripts/check-doc-links.mjs` |
| Avisa de archivos de instrucciones sin entrada de enrutado en `AGENTS.md`, que superan su límite de líneas, con reglas partidas en varias líneas o con prefijo repetido o retirado, y de documentos de `.readme/` con prefijo repetido o retirado | `UserPromptSubmit` | `01-meta-guidelines.md` y `16-documentation.md` | `.scripts/check-instructions.mjs` |
| Avisa de symlinks versionados que el checkout dejó como archivos | `UserPromptSubmit` | `28-agent-tooling-configuration.md` | `.scripts/check-symlinks.mjs` |
| Avisa tras cada edición de archivos de código que superan el límite de líneas y fuerza una continuación al cerrar el turno | `PostToolUse`, sobre ediciones; `Stop`; y `UserPromptSubmit`, que marca el inicio del turno | `14-code-authoring.md` | `.scripts/check-file-length.mjs` |
| Revisión de diseño de Impeccable | `PostToolUse` y `Stop` | — | `scripts/impeccable` de la skill |

## Cómo se lanzan

Los seis primeros son scripts de Node que solo necesitan `git` y `node`. Cada uno se sitúa en la raíz del repositorio con `git rev-parse --show-toplevel`, sea cual sea la carpeta de la sesión, escribe las rutas con `/` y funciona igual en Windows, macOS y Linux, como pide `05-repo-layout.md`. Comparten `.scripts/hook-support.mjs`, que lee la entrada del hook y ejecuta git sin shell.

Cada cliente los lanza a su manera, así que el comando no es el mismo en los dos:

- **Claude Code** usa la forma exec: `command: "node"` y `args` con `${CLAUDE_PROJECT_DIR}/.scripts/<script>`. No pasa por ninguna shell, así que en Windows no depende de Git Bash ni de PowerShell.
- **Codex** tiene dos variantes por hook. `command` se ejecuta en macOS y Linux con la shell de `$SHELL` (`-lc`) o con `/bin/sh`, localiza la raíz con `git rev-parse` y lanza el script; usa sintaxis sh, así que `$SHELL` tiene que ser una shell compatible con sh. `commandWindows` sustituye a `command` en Windows y se ejecuta con `cmd.exe /C`: es un `node -e` que localiza la raíz y carga el script, escrito sin caracteres que cmd.exe, sh o PowerShell interpreten dentro de comillas dobles.

El hook de `git` lee `tool_input.command` como texto o como lista de argumentos, porque los clientes no garantizan la misma forma, y rechaza la llamada saliendo con código 2 y el motivo en stderr. En Claude Code su matcher es `Bash|PowerShell`: en Windows, Claude Code también ejecuta comandos con su herramienta PowerShell, que pasa el comando en el mismo campo; con esa herramienta el hook aplica las comillas de PowerShell. Codex informa su herramienta de shell como `Bash` en todos los sistemas, pero en Windows ejecuta el comando con PowerShell (`pwsh` o `powershell`, y `cmd.exe` solo si no encuentra ninguno), así que el `commandWindows` de este hook pasa `--powershell`: el hook lee entonces el comando como PowerShell y como bash, y lo rechaza si cualquiera de las dos lecturas ve staging en bloque. Así no depende de qué shell use Codex, que su documentación oficial no dice; su código fuente en la versión 0.157.1 (`codex-rs/shell-command/src/shell_detect.rs` y `codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs`), revisado el 2026-09-27, muestra PowerShell. El hook separa los comandos como lo haría la shell, con `.scripts/shell-commands.mjs`, así que un mensaje de commit o una mención entre comillas no cuentan como comando, salvo las sustituciones de comandos que contengan, con `$( ... )` o, fuera de PowerShell, entre acentos graves, porque la shell sí las ejecuta. Un `git add` interactivo pasa, salvo que una tubería, una redirección o un here-string responda por él. En PowerShell, un `git add @( ... )` cuenta siempre como rutas implícitas, aunque la lista sea literal: nombra las rutas directamente. Si el comando es tan anidado que el hook no puede leerlo, lo rechaza.

El hook lee el texto del comando, así que no ve lo que ese texto oculta: el nombre de git guardado en una variable, un alias de git definido en la configuración, un script de shell que se ejecuta desde un archivo, como `bash stage.sh`, o un target de `make`. En esos casos no avisa, pero `27-version-control.md` obliga al agente igualmente a hacer staging por rutas explícitas.

Los de `UserPromptSubmit` imprimen texto plano, que ambos clientes añaden al contexto del modelo, y nunca bloquean. El de enlaces también avisa de las rutas del repositorio citadas entre backticks que ya no existen; qué cuenta como ruta citada lo fija la cabecera de `.scripts/check-doc-links.mjs`. El de instrucciones avisa de los archivos de `.agents/instructions/` que no tienen entrada en la tabla de enrutado de `AGENTS.md`, que superan el límite de líneas de `01-meta-guidelines.md`, que parten una regla en varias líneas, que repiten el prefijo numérico de otro o que reutilizan el de uno retirado según el historial de git, y de los documentos de `.readme/` que hacen lo mismo con sus prefijos, como prohíbe `16-documentation.md`. Los prefijos se comparan por su valor, así que `07-` y `7-` chocan, y un renombrado que conserva el prefijo no retira nada; una entrada que nombra un archivo inexistente la detecta el de enlaces. El de symlinks avisa cuando un symlink versionado, como `.claude/skills`, quedó como archivo de texto, lo que pasa en Windows si Git no puede crear symlinks; la solución está en [Skills de agentes](90-agent-skills.md).

El de longitud actúa en tres momentos. Al enviar cada mensaje deja una marca por sesión en `.temp/check-file-length/`, con el `session_id` que ambos clientes pasan al hook, y borra las marcas de sesiones sin actividad desde hace una semana. Tras cada edición revisa los archivos que esa edición tocó, juzgando cada uno por su ubicación real (resuelve symlinks y las mayúsculas que guarda el sistema de archivos), y, si alguno se pasa, sale con código 2: Claude Code le pasa el motivo al modelo y Codex sustituye con él el resultado de la herramienta, así que el agente divide el archivo en su siguiente paso. Al cerrar el turno revisa los archivos cambiados respecto a `HEAD`, incluidos los que no tienen seguimiento y los que se crearon desde la shell, pero solo los modificados después de la marca de la sesión; sin marca, los revisa todos. Así, el trabajo sin commitear de otra sesión no fuerza continuaciones, salvo que se modifique durante el turno. Si encuentra alguno, hace continuar el turno una sola vez: si el cierre ya viene de una continuación forzada por cualquier hook de `Stop` (`stop_hook_active`), deja terminar. Un archivo que ya pasaba del límite en `HEAD` puede cambiar pero no crecer; uno creado y commiteado dentro del mismo turno ya forma parte de `HEAD` y no se revisa.

El límite lo fija `.scripts/check-file-length.mjs`, y el aviso del hook incluye el número; qué cuenta como código lo fija `.scripts/source-files.mjs`. Un proyecto derivado exime sus archivos generados o vendorizados marcándolos en `.gitattributes` con `linguist-generated` o `linguist-vendored`, como hace la plantilla con `.agents/skills/`, y cualquier otro archivo exento que el script no reconozca, con `-source-file-limit`.

El de Impeccable no hace cumplir ni cita una regla enrutada: lo instala y regenera la skill con un comando distinto por cliente (rutas `.claude/skills` y `.agents/skills`; `commandWindows` solo en Codex), como describe [Skills de agentes](90-agent-skills.md).

## Sistemas y requisitos

La plantilla soporta Windows, macOS y Linux con los dos clientes. [CI de la plantilla](94-template-ci.md) prueba los hooks de reglas en Windows y Linux; macOS se valida en local.

| Requisito | Para qué | Sistemas |
| --- | --- | --- |
| `git` en el `PATH` | Todos los hooks de reglas | Todos |
| Node en el `PATH`, versión 24 (la que prueba el CI) | Los scripts de `.scripts/` | Todos |
| Symlinks habilitados en Git | `.claude/skills`, por el que Claude Code descubre las skills | Windows |
| Git Bash | Los hooks de Impeccable en Claude Code | Windows |

Si falta `git` o `node`, el hook deja de actuar sin bloquear nada, y el cliente solo muestra un error no bloqueante.

Los hooks de Impeccable quedan fuera de esa garantía; este documento declara esa exclusión y su motivo, como permite `28-agent-tooling-configuration.md`. En Claude Code usan sintaxis sh: Claude Code los lanza con `sh -c` en macOS y Linux y con Git Bash en Windows, y sin Git Bash los lanza con PowerShell, donde fallan. Además llegan a través del symlink `.claude/skills`, así que sin él no se ejecutan y no avisan. En Codex, `commandWindows` llama a `scripts/impeccable.cmd`, que su propio archivo declara aún no probado en una máquina Windows real.

## Codex: aprobación de los hooks

Codex no ejecuta un hook de proyecto hasta que el usuario lo revisa. Al abrir una sesión con hooks nuevos o modificados muestra un aviso con tres opciones: `Review hooks`, `Trust all and continue` y `Continue without trusting`. Con la última, los hooks quedan desactivados y la sesión sigue sin ellos, sin avisar después.

La aprobación se guarda por hook, como un hash, en la tabla `[hooks.state]` del `config.toml` del usuario: `~/.codex/config.toml` en macOS y Linux, `%USERPROFILE%\.codex\config.toml` en Windows, o el de `CODEX_HOME` si está definido. Es configuración del usuario y no del repositorio, así que cada máquina y cada persona aprueban por su cuenta.

Cambiar el comando de un hook cambia su hash. Tras adoptar una versión de la plantilla que modifica un hook, Codex vuelve a pedir la aprobación y el hook no se ejecuta hasta darla.

`--dangerously-bypass-hook-trust` ejecuta los hooks sin aprobarlos durante una invocación. No sirve como vía ordinaria: aprobarlos es una decisión sobre qué se ejecuta en la máquina, y `03-approval-boundaries.md` prohíbe sortear un límite de ese tipo.

## Claude Code

Claude Code ejecuta los hooks de `.claude/settings.json` sin aprobación previa. El archivo se versiona para que los hooks, y los plugins que registra [Servidores de lenguaje de agentes](93-agent-language-servers.md), lleguen a los proyectos derivados; un proyecto conserva a su lado sus ajustes propios, como las exenciones de sandbox que registra [Sandbox de agentes](91-agent-sandbox.md).

Además de los ajustes de presentación de la sección siguiente, dos ajustes de ese archivo cambian lo que hace el agente y solo existen en Claude Code. `attribution`, con `commit` y `pr` vacíos, suprime las líneas de autoría que Claude Code añadiría a commits y PRs, como pide `27-version-control.md`. En Codex esa atribución depende de un ajuste de la cuenta que el cliente consulta al servidor, no de `.codex/config.toml`, así que el repositorio no puede fijarla; si está activa, Codex pide al modelo terminar los commits con `Co-authored-by: Codex`, en contra de la regla escrita. `permissions.defaultMode` fija el modo de permisos de Claude Code; su equivalente en Codex es `approval_policy`, descrito en [Sandbox de agentes](91-agent-sandbox.md), y `.codex/config.toml` no lo fija, así que cada persona conserva el suyo.

## Ajustes de presentación y búsqueda

El repositorio fija también cómo se presentan las respuestas y si Codex busca en la web. Los heredan los proyectos derivados; en Claude Code, cada persona puede cambiarlos solo en su máquina con `.claude/settings.local.json`, y Codex solo carga `.codex/config.toml` cuando la persona confía en el proyecto.

| Ajuste | Archivo | Efecto | Equivalente en el otro cliente |
| --- | --- | --- | --- |
| `outputStyle: "Concise"` | `.claude/settings.json` | Estilo de salida integrado en Claude Code desde la 2.1.237: la respuesta empieza por el resultado, sin introducción, narración ni resumen final. El nombre distingue mayúsculas; uno que no existe vuelve a `default` sin avisar. | No hay uno exacto; el más cercano es `model_verbosity`. |
| `viewMode: "focus"` | `.claude/settings.json` | Cada sesión empieza en la vista de foco, que muestra solo el último mensaje, una línea por cada tanda de herramientas y la respuesta final. Necesita el renderizador de pantalla completa. | Ninguno. |
| `tui: "fullscreen"` | `.claude/settings.json` | Usa el renderizador de pantalla completa sin parpadeo; `CLAUDE_CODE_NO_FLICKER` y `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` lo anulan. | `alternate_screen = "always"` en la tabla `[tui]` de Codex, que el repositorio no fija. |
| `model_verbosity = "low"` | `.codex/config.toml` | Pide respuestas breves a los modelos GPT-5 a través de la Responses API; los proveedores de Chat Completions lo ignoran. | `outputStyle: "Concise"`, que en Claude Code es una instrucción de estilo y no un parámetro del modelo. |
| `web_search = "live"` | `.codex/config.toml` | Activa la búsqueda web en vivo sin aprobación por llamada, como `--search`. Los valores son `disabled`, `cached`, que es el de omisión, `indexed` y `live`. | La herramienta `WebSearch` de Claude Code, que se permite o se niega con reglas de permiso y no con un ajuste. |

Con `web_search = "live"`, OpenAI ejecuta la búsqueda en sus servidores y consulta páginas en vivo: el texto de la consulta, que redacta el agente, sale de la máquina sin pasar por el sandbox ni por su lista de dominios. `WebSearch` de Claude Code hace lo mismo en los servidores de Anthropic. Por eso las consultas no llevan secretos, datos personales ni detalles internos del producto, como exige `08-storage-and-secrets.md`.

Verificado el 2026-09-27 con Claude Code 2.1.280 y Codex CLI 0.157.1 contra la [referencia de ajustes de Claude Code](https://code.claude.com/docs/en/settings-reference), sus [estilos de salida](https://code.claude.com/docs/en/output-styles), la [referencia de configuración de Codex](https://learn.chatgpt.com/docs/config-file/config-reference) y su [búsqueda web](https://learn.chatgpt.com/docs/web-search).
