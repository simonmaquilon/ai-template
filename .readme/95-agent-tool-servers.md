# Servidores de herramientas de agentes

Los clientes de agente pueden conectarse a servidores MCP externos que les añaden herramientas. `13-agent-tooling.md` los trata como dependencias de terceros y manda mantener su identidad y sus requisitos en la configuración y en `.readme/`, y `06-dependencies-and-stack.md` fija cómo se evalúa una dependencia. Este archivo registra cuáles declara la plantilla, qué datos reciben, cómo se aprueban y cómo se retiran.

## Registro

| Servidor | Uso | Claude Code | Codex |
| --- | --- | --- | --- |
| `context7` | Documentación actualizada de librerías y frameworks, consultada por versión | `.mcp.json` | `.codex/config.toml` |
| `appium-mcp` | Sesiones del agente sobre una aplicación móvil; no viene declarado, lo añade el proyecto que lo elige | `.mcp.json` | `.codex/config.toml` |

## Context7

- Lo publica [Upstash](https://github.com/upstash/context7) con licencia MIT. Ese repositorio contiene el servidor MCP; el backend, el parser y el crawler que generan la documentación son privados.
- Se conecta por HTTP a `https://mcp.context7.com/mcp` y no instala nada en la máquina.
- Expone dos herramientas: `resolve-library-id`, que convierte el nombre de una librería en su identificador de Context7, y `query-docs`, que devuelve documentación y ejemplos para ese identificador.
- Es un servicio remoto, así que no se puede fijar su versión: el servidor informa la suya al conectarse y puede cambiar sin aviso. `13-agent-tooling.md` pide fijar cada dependencia solo hasta donde su configuración lo permite.
- No requiere API key; una key gratuita de context7.com solo sube los límites de uso. Si un proyecto la añade, va por el mecanismo de secretos y nunca en la configuración versionada, como exige `AGENTS.md`.
- Al conectarse, el servidor devuelve en el campo `instructions` de MCP cuándo consultarlo, que Claude Code y Codex añaden al contexto del modelo como guía de uso del servidor. Por eso la plantilla no adopta la skill `context7-mcp` que publica `upstash/context7`, que da esa misma indicación.

Se comprobó que, sin API key, el endpoint devuelve esas instrucciones, lista esas dos herramientas y resuelve una consulta de prueba.

### Datos que salen de la máquina

Cada llamada envía a Upstash el nombre de la librería y el texto de la consulta, que redacta el agente. No envía archivos del repositorio, pero la consulta puede describir el proyecto, y como el backend es privado, su repositorio no documenta cómo trata esos datos. Por eso las consultas no llevan secretos, datos personales ni detalles internos del producto, como exige `08-security-and-data.md`.

### Aprobación en cada cliente

- Claude Code pide aprobación, en las sesiones interactivas, antes de usar un servidor declarado en `.mcp.json`; `claude mcp reset-project-choices` borra las elecciones hechas.
- Codex solo carga `.codex/config.toml` cuando la persona confía en el proyecto.

## appium-mcp

La plantilla no lo declara. Lo añade `start`, o el proyecto después, solo cuando el proyecto tiene una aplicación móvil y la persona lo autoriza de forma explícita, porque corre fuera del sandbox con las herramientas del SDK del equipo.

- Lo publica el [proyecto Appium](https://github.com/appium/appium-mcp) con licencia Apache-2.0, en npm con atestación de procedencia. Sirve para que el agente opere una aplicación en un emulador de Android o un simulador de iOS: elige el dispositivo, abre la sesión, busca elementos, pulsa, escribe, captura la pantalla y lee su estructura.
- Trae dentro los drivers de Android y de iOS y abre la sesión él mismo: no necesita un servidor de Appium aparte ni las dependencias de las [pruebas del proyecto](98-agent-test-automation.md#appium-con-webdriverio-para-las-pruebas-del-proyecto), que son independientes y pueden llevar otras versiones.
- Es un proceso local que el cliente arranca por `stdio`. Como los demás servidores MCP, no pasa por el sandbox de los comandos de shell.
- Sus requisitos son los del [lanzador de dispositivos móviles](90-agent-skills.md#lanzador-de-dispositivos-móviles), que `node .scripts/device.mjs doctor` comprueba, y lee `ANDROID_HOME` del entorno del cliente.

### Versión

Se fija como las demás herramientas: `node .scripts/tool-versions.mjs --add appium-mcp --repository https://github.com/appium/appium-mcp` registra la versión, su hash y su procedencia en `.agents/tool-versions.json`, y como escribe un archivo protegido corre fuera del sandbox, con la aprobación del cliente. El cliente no ejecuta el paquete con `run-pinned.mjs`, cuya caché `.temp/npm-cache` puede reescribir cualquier comando confinado antes de que el cliente ejecute ese código sin confinar, sino con `node .scripts/mobile-server.mjs`, un lanzador propio como el [del navegador](90-agent-skills.md#lanzador-del-navegador):

- Instala `appium-mcp@<versión>` con `--ignore-scripts` en una caché por persona fuera del repositorio y del temporal del sistema, donde un comando confinado no escribe: `~/Library/Caches/agent-mobile` en macOS, `$XDG_CACHE_HOME/agent-mobile` o `~/.cache/agent-mobile` en Linux y `%LOCALAPPDATA%\agent-mobile` en Windows. Con una caché que no puede escribir, como la de un comando confinado, se niega a correr y lo dice.
- En cada arranque compara la versión y el hash de integridad que npm anotó en `node_modules/.package-lock.json` con los de `.agents/tool-versions.json`. Si no coinciden, borra la carpeta y reinstala; si la instalación nueva tampoco coincide, la borra y no ejecuta nada. No vuelve a calcular el hash del contenido instalado.
- Ejecuta el archivo que declara el campo `bin` del `package.json` instalado, con el Node que lo lanza y sin shell, y solo si es un archivo normal dentro de la carpeta del paquete: sin `..`, sin ruta absoluta ni de unidad y sin enlace simbólico en el camino.
- Para el cliente es el mismo servidor por `stdio`: hereda stdin, stdout y stderr, no escribe nada propio en stdout (sus mensajes y la salida de npm van a stderr), reenvía `SIGINT`, `SIGTERM` y `SIGHUP` y devuelve el código de salida del servidor. El servidor también termina si el lanzador muere sin poder reenviar nada, porque vigila el canal IPC que comparte con él, un mecanismo que no depende de las señales y que está comprobado en macOS, no en Windows.
- Con `--check` instala si hace falta, arranca el servidor, le pide `initialize` (versión de protocolo `2025-06-18`), `notifications/initialized` y `tools/list`, imprime en stdout una línea con su nombre, su versión y el número de herramientas, lo detiene y sale con 0; sale con 1 si el servidor falla, escribe algo que no es JSON por stdout o no contesta en dos minutos. Sirve para dejar la caché lista y para la prueba de humo del CI de la plantilla.

Sus límites, además de los tres de la lista que sigue: el hash cubre `appium-mcp`, no sus dependencias, que npm resuelve por rango sin comparar hash; no valida la firma del registro; quien edita `.agents/tool-versions.json` con las herramientas de archivo, que `filesystem.denyWrite` solo impide a los comandos confinados, elige la versión que corre; y dos arranques a la vez con la caché vacía pueden pisarse la instalación, que otro arranque repara, por lo que el primero se hace a mano con `--check`.

- **Raíz del repositorio.** La ruta de `args` es relativa: el cliente la resuelve contra la carpeta en la que arranca el servidor, y `filesystem.denyWrite` solo protege `.scripts/` en la raíz. Un cliente abierto en una subcarpeta que tuviera su propio `.scripts/mobile-server.mjs`, que un comando confinado sí puede crear, ejecutaría ese archivo sin confinar. El cliente se abre en la raíz del repositorio; no está comprobado desde qué carpeta arranca cada cliente el servidor cuando se abre en otra.
- **Codex.** Estas garantías descansan en `filesystem.denyWrite`, que es configuración de Claude Code. El sandbox de Codex deja escribir `.scripts/` y `.agents/tool-versions.json` ([sandbox](91-agent-sandbox.md)), así que allí un comando confinado puede cambiar el lanzador o la versión que el cliente ejecuta después sin confinar: en Codex el servidor se declara sabiendo que solo lo limita la aprobación de cada comando.
- **Instalación sin scripts.** `--ignore-scripts` omite los scripts de instalación de algunas dependencias, entre ellas las de dispositivos iOS físicos y las que descargan controladores de navegador; una función que dependa de ellos puede fallar.

### Declaración

En `.mcp.json`, dentro de `mcpServers`:

```json
"appium-mcp": {
  "command": "node",
  "args": [".scripts/mobile-server.mjs"],
  "env": {
    "NO_UI": "true",
    "ALLOW_REMOTE_APP_URLS": "false",
    "REMOTE_SERVER_ENABLE_DIRECT_CONNECT": "false",
    "REMOTE_SERVER_URL_ALLOW_REGEX": "^http://127\\.0\\.0\\.1(:\\d+)?(/|$)"
  }
}
```

En `.codex/config.toml`:

```toml
[mcp_servers.appium-mcp]
command = "node"
args = [".scripts/mobile-server.mjs"]
env_vars = ["ANDROID_HOME", "ANDROID_SDK_ROOT", "JAVA_HOME"]

[mcp_servers.appium-mcp.env]
NO_UI = "true"
ALLOW_REMOTE_APP_URLS = "false"
REMOTE_SERVER_ENABLE_DIRECT_CONNECT = "false"
REMOTE_SERVER_URL_ALLOW_REGEX = '^http://127\.0\.0\.1(:\d+)?(/|$)'
```

Codex solo pasa a un servidor local un conjunto fijo de variables del entorno, según su documentación, así que `env_vars` le reenvía las del SDK; en Claude Code el servidor hereda el entorno del cliente. Las cuatro variables de `env` se declaran siempre; quitar una restricción es una decisión del proyecto que se registra aquí con su motivo:

- `ALLOW_REMOTE_APP_URLS=false` impide instalar en el dispositivo una aplicación descargada de una URL: solo vale una ruta local.
- `REMOTE_SERVER_URL_ALLOW_REGEX` limita a este equipo los servidores de Appium remotos a los que puede conectarse; sin ella acepta cualquier URL.
- `REMOTE_SERVER_ENABLE_DIRECT_CONNECT=false` impide que un servidor remoto redirija la sesión a otra dirección, que no se comprobaría contra esa expresión.
- `NO_UI=true` quita los componentes de interfaz que añade a sus respuestas.

Quedan como vienen, apagadas, y encender una es otra decisión del proyecto, con lo que `08-security-and-data.md` pide: la visión por IA (`AI_VISION_ENABLED`), que mandaría las capturas a una API externa; la telemetría (`APPIUM_MCP_OTEL_ENABLED`); la consulta de documentación (`APPIUM_MCP_DOCS_ENABLED`), que carga otro paquete y un modelo; la persistencia de sesiones remotas (`APPIUM_MCP_PERSIST_REMOTE_SESSIONS_PATH`), que guarda credenciales en disco; y el transporte HTTP, que esta declaración no usa.

### Datos que salen de la máquina con appium-mcp

Las variables declaradas cierran dos vías concretas, la URL de un servidor remoto y la descarga de una aplicación, no todo el acceso a la red: su README lo dice así. Las demás salidas dependen de las capacidades con que el agente abre la sesión, que llegan a los drivers sin filtro (apartado siguiente).

Por su cuenta descarga dos cosas. El lanzador baja de npm el paquete en la versión fijada y sus dependencias, entre ellas los drivers, que son dependencias con rango que npm resuelve sin comparar hash. Y la primera vez que prepara un simulador de iOS baja de GitHub la última versión publicada del agente de pruebas (WebDriverAgent), sin versión fija ni hash, y la guarda en una caché por persona; `APPIUM_MCP_WDA_APP_PATH`, con la ruta absoluta de una copia ya extraída, evita esa descarga.

### Lo que puede hacer y sus límites

- Arranca simuladores por su cuenta, instala y desinstala aplicaciones desde una ruta local, concede permisos, y lee y escribe archivos del dispositivo. Por eso se usa solo contra emuladores y simuladores con datos que no son de producción y cuentas de prueba, como las sesiones de navegador (`07-interface.md`).
- Alcanza también dispositivos físicos: lista los que ve `adb` y tiene una herramienta que prepara un iPhone real. El lanzador de dispositivos se niega a tocarlos; este servidor no, y nada de la declaración lo impide: solo lo limita la regla de `07-interface.md` y la aprobación de cada llamada.
- Abre las sesiones con todas las funciones inseguras de Appium habilitadas, y las capacidades que elige el agente llegan sin filtro a los drivers. En su código, leído y no ejecutado, eso incluye capacidades de Android que ejecutan en el equipo, fuera del sandbox, un binario en la ruta que se le indique o descargan y ejecutan un controlador de navegador, y capacidades que conectan con otros equipos sin pasar por la expresión declarada. La única barrera es la aprobación de cada llamada en el cliente: sus herramientas no se añaden a una lista de permisos automáticos, y una capacidad que nombra una ruta o una dirección del equipo se revisa antes de aprobarla.
- Su propio README dice que no está pensado para exponerse a clientes que no sean de confianza: es para una persona en su equipo o un CI de confianza.
- Las capturas y las grabaciones van a la carpeta temporal del sistema salvo que el proyecto fije `SCREENSHOTS_DIR` con una ruta absoluta, y la estructura de pantalla que se guarda en archivo, salvo que fije `PAGE_SOURCES_DIR`.
- El primer arranque instala el paquete y tarda más de un minuto, que puede superar el plazo de conexión del cliente: `node .scripts/mobile-server.mjs --check` lo instala y lo comprueba una vez, y deja la caché lista.
- Una sesión de iOS se crea con la dirección del agente de pruebas que devuelve la preparación del simulador; sin ella intenta compilarlo con Xcode, y en la comprobación eso falló.

Comprobado en macOS, fuera de un cliente y hablando el protocolo por `stdio` con el paquete fijado, instalado con `npx` por `run-pinned.mjs`: lista sus herramientas; abre una sesión, lee el tamaño de la ventana y captura la pantalla en un simulador de iOS y en un emulador de Android; rechaza una URL de servidor remoto que no es de este equipo y la instalación desde una URL. Con el lanzador `mobile-server.mjs`, también en macOS, `--check` instala el paquete real en su caché, lo arranca y lista sus herramientas, vuelve a instalarlo cuando el hash anotado en la caché no coincide, y el arranque sin argumentos repite esas sesiones en el simulador de iOS y en el emulador de Android y los dos rechazos, sin añadir nada propio a stdout; sus pruebas, con un servidor falso, pasan en macOS. Las pruebas y la prueba de humo con el paquete real están preparadas para el CI de la plantilla, en Linux y en Windows, y este texto no las da por pasadas allí. No está comprobado dentro de Claude Code ni de Codex, ni las sesiones sobre dispositivos en Windows ni en Linux, ni con dispositivos físicos.

## Retirar o desactivar un servidor

- Un proyecto derivado lo retira borrando su entrada de `.mcp.json` y su tabla `[mcp_servers.<nombre>]` de `.codex/config.toml` en el mismo cambio, y su fila y su sección de este archivo.
- Para desactivarlo sin borrar su configuración, Codex acepta `enabled = false` en su tabla, y Claude Code, el nombre del servidor en la lista `disabledMcpjsonServers` de sus ajustes; en `.claude/settings.local.json` solo afecta a una persona.

## Añadir otro servidor

1. Verifica quién lo publica, qué datos recibe y qué herramientas expone, según `06-dependencies-and-stack.md`.
2. Decláralo en `.mcp.json` y en `.codex/config.toml`, o explica aquí por qué un cliente queda fuera, como pide `13-agent-tooling.md`.
3. Añade su fila al registro y su sección.
