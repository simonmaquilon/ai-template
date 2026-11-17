# Servidores de lenguaje de agentes

Un servidor de lenguaje da al cliente de agente diagnósticos tras cada edición y navegación por símbolos: definiciones, referencias e implementaciones. `02-change-workflow.md` y `04-validation-and-testing.md` fijan cuándo se usan sin nombrar ninguno; este archivo registra cuáles están habilitados, qué binario necesita cada uno y en qué clientes funcionan. Añadir o quitar un servidor cambia la configuración del cliente y este archivo, nunca las instrucciones.

## Registro

`enabledPlugins` en `.claude/settings.json`, y en `.claude/settings.local.json` en un proyecto derivado que añade plugins propios, es la fuente de qué plugins están habilitados; la tabla añade lo que esos archivos no dicen. Las extensiones son las que declara la entrada del plugin en su marketplace.

| Plugin | Lenguajes y extensiones | Binario | Claude Code | Codex |
| --- | --- | --- | --- | --- |
| `typescript-lsp@claude-plugins-official` | TypeScript y JavaScript: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs` | `typescript-language-server` | `.claude/settings.json` | fuera |

## Binarios

El plugin solo indica qué comando arranca el servidor y qué extensiones atiende; el binario se instala aparte en cada máquina y el cliente lo busca en el `PATH`. Con un gestor de versiones de Node, la instalación global pertenece a la versión activa y hay que repetirla al cambiar de versión.

### `typescript-language-server`

```bash
node .scripts/run-pinned.mjs --install typescript-language-server typescript
typescript-language-server --version
```

El servidor envuelve `tsserver`, que las versiones mayores de TypeScript más recientes ya no incluyen. Por eso `.agents/tool-versions.json` retiene `typescript` en una línea mayor anterior (`hold`, con su motivo), que ningún refresco salta aunque `latest` sea otra: el comando del README del plugin, sin rango, instala la versión más reciente y el servidor no arranca (`Could not find a valid TypeScript installation`). El comando instala las dos versiones que registra ese archivo, que el bloque Template Tooling de [stack.md](../.docs/stack.md) muestra con su procedencia y su retención; cambiarlas es una actualización que `06-dependencies-and-stack.md` somete a aprobación, y `node .scripts/tool-versions.mjs --refresh` la hace, como explica [Skills de agentes](90-agent-skills.md).

El servidor usa el TypeScript del proyecto cuando `node_modules/typescript` trae `tsserver`, y solo recurre al global cuando el proyecto no lo trae, como en esta plantilla. Un proyecto en una versión mayor de TypeScript que ya no trae `tsserver` cae al global sin avisar, así que sus diagnósticos no corresponden a la versión del proyecto.

## Cobertura por cliente

### Claude Code

Los plugins de la plantilla se habilitan en `.claude/settings.json`, que se versiona y en un proyecto derivado queda sellado, así que llegan a quien abre el proyecto y a los derivados. Un plugin propio de un derivado se habilita en `.claude/settings.local.json`, que Claude Code aplica por encima del compartido y que no puede quitarle entradas; ese archivo es por persona, git lo ignora y las sesiones en la nube no lo leen, así que cada persona lo habilita en el suyo. Claude Code registra el marketplace `claude-plugins-official` en la primera sesión interactiva de terminal e instala por su cuenta los plugins que `enabledPlugins` habilita desde él, porque ese marketplace los declara con una ruta relativa; no hace falta `claude plugin install`. En `claude -p` esa instalación corre en segundo plano y el plugin puede faltar en el primer turno; `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` hace que la ejecución la espere.

Si falta el binario, la pestaña **Errors** de `/plugin` muestra `Executable not found in $PATH: "<binario>"` y la sesión sigue sin ese servidor. Claude Code no arranca servidores de lenguaje en las sesiones en la nube.

Un plugin habilitado solo actúa sobre sus extensiones, así que no molesta a un proyecto derivado en otro lenguaje. Para retirarlo de la plantilla se pone a `false` en `.claude/settings.json`; en un derivado, ese archivo sellado lo mantiene habilitado, y una persona lo desactiva solo en su máquina con `.claude/settings.local.json`, o el proyecto registra `.claude/settings.json` en la lista de excepciones de [Adopción de versiones de la plantilla](96-template-adoption.md), con la aprobación del usuario, y lo retira en él.

Para comprobarlo, abre una sesión nueva en la raíz del proyecto y ejecuta `/plugin`: el plugin aparece en **Installed** y **Errors** no tiene filas suyas. Después pide a Claude que introduzca un error de sintaxis en un archivo de una extensión del plugin: bajo la edición aparece `Found N new diagnostic issues`. Deshaz el error. Sin sesión interactiva, el evento `init` de `claude -p --output-format stream-json --verbose` lista el plugin en `plugins` y la herramienta `LSP` en `tools`.

### Codex

Codex no tiene soporte nativo de servidores de lenguaje, así que queda fuera, como permite `13-agent-tooling.md` al declarar el motivo. En sus sesiones, `02-change-workflow.md` hace seguir con el índice de código y las búsquedas.

## Añadir otro servidor

Un servidor de un marketplace oficial:

1. Localiza el plugin del lenguaje en la tabla de plugins de inteligencia de código de la documentación de Claude Code y lee en su README qué binario necesita.
2. Verifica la procedencia del binario según `06-dependencies-and-stack.md`, registra su versión y procedencia, en la tabla Project Tooling de [stack.md](../.docs/stack.md) si lo añade el proyecto y, si lo añade la plantilla, en `.agents/tool-versions.json` con `node .scripts/tool-versions.mjs --add <paquete> --repository <url>`, e instálalo; si es un paquete de npm, con `node .scripts/run-pinned.mjs --install <paquete>`.
3. Revisa los hooks y permisos que declara el plugin, como exige `13-agent-tooling.md`, y añade `"<plugin>@claude-plugins-official": true` a `enabledPlugins`: en `.claude/settings.json` si lo añade la plantilla, y en `.claude/settings.local.json`, por persona, si lo añade un proyecto derivado.
4. Añade su fila al registro y su sección a Binarios.

Un servidor propio, sin plugin oficial:

1. Crea `.claude/skills/<nombre>/.claude-plugin/plugin.json` con `{ "name": "<nombre>" }` y, en `.claude/skills/<nombre>/.lsp.json`, el servidor:

   ```json
   {
     "<servidor>": {
       "command": "<binario>",
       "args": ["--stdio"],
       "extensionToLanguage": { ".<extensión>": "<id de lenguaje LSP>" }
     }
   }
   ```

   Claude Code carga esa carpeta como `<nombre>@skills-dir` para todos los que abren el proyecto, tras aceptar el diálogo de confianza de la carpeta. En esta plantilla `.claude/skills` es un symlink a `.agents/skills/`, como explica [Skills de agentes](90-agent-skills.md), así que el plugin vive allí. Es la excepción a lo que dice ese documento: no viene de un repositorio público ni figura en `skills-lock.json`. Como el resto de `.agents/skills/`, queda fuera del límite de líneas. En Windows, el paso requiere que el symlink exista; en un clon sin symlinks, `.claude/skills` es un archivo y la carpeta no se puede crear.
2. `claude plugin validate` no lee `.lsp.json`. Si una entrada es inválida, el archivo entero se descarta y **Errors** muestra `Invalid LSP server config for ".lsp.json"`.
3. Verifica la procedencia del binario, que el plugin no incluye, registra su versión y procedencia, en la tabla Project Tooling de [stack.md](../.docs/stack.md) si lo añade el proyecto y, si lo añade la plantilla, en `.agents/tool-versions.json` con `node .scripts/tool-versions.mjs --add <paquete> --repository <url>`, e instálalo; si es un paquete de npm, con `node .scripts/run-pinned.mjs --install <paquete>`.
4. Añade su fila al registro y su sección a Binarios.

Cada extensión la atiende un solo servidor: si dos plugins habilitados reclaman la misma, **Errors** muestra `LSP server "<nombre>" is not used for <extensión> files` para el que queda fuera.
