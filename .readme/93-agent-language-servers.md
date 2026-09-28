# Servidores de lenguaje de agentes

Un servidor de lenguaje da al cliente de agente diagnósticos tras cada edición y navegación por símbolos: definiciones, referencias e implementaciones. `29-language-servers.md` fija cuándo se usan sin nombrar ninguno; este archivo registra cuáles están habilitados, qué binario necesita cada uno y en qué clientes funcionan. Añadir o quitar un servidor cambia la configuración del cliente y este archivo, nunca las instrucciones.

## Registro

`enabledPlugins` en `.claude/settings.json` es la fuente de qué plugins están habilitados; la tabla añade lo que ese archivo no dice. Las extensiones son las que declara la entrada del plugin en su marketplace.

| Plugin | Lenguajes y extensiones | Binario | Claude Code | Codex |
| --- | --- | --- | --- | --- |
| `typescript-lsp@claude-plugins-official` | TypeScript y JavaScript: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs` | `typescript-language-server` | `.claude/settings.json` | fuera |

## Binarios

El plugin solo indica qué comando arranca el servidor y qué extensiones atiende; el binario se instala aparte en cada máquina y el cliente lo busca en el `PATH`. Con un gestor de versiones de Node, la instalación global pertenece a la versión activa y hay que repetirla al cambiar de versión.

### `typescript-language-server`

```bash
npm install -g typescript-language-server@6.0.1 typescript@6.0.3
typescript-language-server --version
```

El servidor envuelve `tsserver`, que TypeScript 7 ya no incluye. Por eso el `typescript` global se fija en una versión anterior a la 7: el comando del README del plugin, sin rango, instala TypeScript 7 y el servidor no arranca (`Could not find a valid TypeScript installation`). El comando fija las dos versiones verificadas de la tabla de abajo; cambiarlas es una actualización que `07-dependencies-and-binaries.md` somete a aprobación.

El servidor usa el TypeScript del proyecto cuando `node_modules/typescript` trae `tsserver`, y solo recurre al global cuando el proyecto no lo trae, como en esta plantilla. Un proyecto en TypeScript 7 cae al global sin avisar, así que sus diagnósticos no corresponden a la versión del proyecto.

Versiones y procedencia verificadas el 2026-09-26:

| Paquete | Versión | Licencia | Origen | Verificación |
| --- | --- | --- | --- | --- |
| `typescript-language-server` | 6.0.1 | Apache-2.0 | [typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) | publicado desde GitHub Actions con atestación de procedencia; firma del registro y atestación verificadas con `npm audit signatures`; sin dependencias ni scripts de instalación; requiere Node 22.22.2 o superior |
| `typescript` | 6.0.3 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | publicado por `typescript-bot`; firma del registro verificada con `npm audit signatures`; sin dependencias ni scripts de instalación |

## Cobertura por cliente

### Claude Code

Los plugins se habilitan en `.claude/settings.json`, que se versiona, así que llegan a quien abre el proyecto y a los proyectos derivados. Claude Code registra el marketplace `claude-plugins-official` en la primera sesión interactiva de terminal e instala por su cuenta los plugins que `enabledPlugins` habilita desde él, porque ese marketplace los declara con una ruta relativa; no hace falta `claude plugin install`. En `claude -p` esa instalación corre en segundo plano y el plugin puede faltar en el primer turno; `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` hace que la ejecución la espere.

Si falta el binario, la pestaña **Errors** de `/plugin` muestra `Executable not found in $PATH: "<binario>"` y la sesión sigue sin ese servidor. Claude Code no arranca servidores de lenguaje en las sesiones en la nube.

Un plugin habilitado solo actúa sobre sus extensiones, así que no molesta a un proyecto derivado en otro lenguaje. Para retirarlo de un proyecto se pone a `false` en su `.claude/settings.json`; una persona lo desactiva solo en su máquina con `.claude/settings.local.json`.

Para comprobarlo, abre una sesión nueva en la raíz del proyecto y ejecuta `/plugin`: el plugin aparece en **Installed** y **Errors** no tiene filas suyas. Después pide a Claude que introduzca un error de sintaxis en un archivo de una extensión del plugin: bajo la edición aparece `Found N new diagnostic issues`. Deshaz el error. Sin sesión interactiva, el evento `init` de `claude -p --output-format stream-json --verbose` lista el plugin en `plugins` y la herramienta `LSP` en `tools`.

### Codex

Codex no tiene soporte nativo de servidores de lenguaje, así que queda fuera, como permite `28-agent-tooling-configuration.md` al declarar el motivo. En sus sesiones, `29-language-servers.md` hace seguir con el índice de código y las búsquedas.

## Añadir otro servidor

Un servidor de un marketplace oficial:

1. Localiza el plugin del lenguaje en la tabla de plugins de inteligencia de código de la documentación de Claude Code y lee en su README qué binario necesita.
2. Instala el binario y verifica su procedencia según `07-dependencies-and-binaries.md`.
3. Revisa los hooks y permisos que declara el plugin, como exige `28-agent-tooling-configuration.md`, y añade `"<plugin>@claude-plugins-official": true` a `enabledPlugins` en `.claude/settings.json`.
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

   Claude Code carga esa carpeta como `<nombre>@skills-dir` para todos los que abren el proyecto, tras aceptar el diálogo de confianza de la carpeta. En esta plantilla `.claude/skills` es un symlink a `.agents/skills/`, como explica [Skills de agentes](90-agent-skills.md), así que el plugin vive allí. Es la excepción a lo que dice ese documento: no viene de un repositorio público ni figura en `skills-lock.json`. Como `.gitattributes` marca `.agents/skills/` como vendorizado, añade al final de ese archivo `.agents/skills/<nombre>/** -linguist-vendored` para que el límite de líneas revise su código. En Windows, el paso requiere que el symlink exista; en un clon sin symlinks, `.claude/skills` es un archivo y la carpeta no se puede crear.
2. `claude plugin validate` no lee `.lsp.json`. Si una entrada es inválida, el archivo entero se descarta y **Errors** muestra `Invalid LSP server config for ".lsp.json"`.
3. Instala el binario, que el plugin no incluye, y verifica su procedencia.
4. Añade su fila al registro y su sección a Binarios.

Cada extensión la atiende un solo servidor: si dos plugins habilitados reclaman la misma, **Errors** muestra `LSP server "<nombre>" is not used for <extensión> files` para el que queda fuera.
