# Servidores de herramientas de agentes

Los clientes de agente pueden conectarse a servidores MCP externos que les añaden herramientas. `28-agent-tooling-configuration.md` los trata como dependencias de terceros bajo `07-dependencies-and-binaries.md`, que pide registrar aquí los que declara la plantilla. Este archivo registra cuáles son, qué datos reciben, cómo se aprueban y cómo se retiran.

## Registro

| Servidor | Uso | Claude Code | Codex |
| --- | --- | --- | --- |
| `context7` | Documentación actualizada de librerías y frameworks, consultada por versión | `.mcp.json` | `.codex/config.toml` |

## Context7

- Lo publica [Upstash](https://github.com/upstash/context7) con licencia MIT. Ese repositorio contiene el servidor MCP; el backend, el parser y el crawler que generan la documentación son privados.
- Se conecta por HTTP a `https://mcp.context7.com/mcp` y no instala nada en la máquina.
- Expone dos herramientas: `resolve-library-id`, que convierte el nombre de una librería en su identificador de Context7, y `query-docs`, que devuelve documentación y ejemplos para ese identificador.
- Es un servicio remoto, así que no se puede fijar su versión: el servidor informa la suya al conectarse y puede cambiar sin aviso. `28-agent-tooling-configuration.md` pide fijar cada dependencia solo hasta donde su configuración lo permite.
- No requiere API key; una key gratuita de context7.com solo sube los límites de uso. Si un proyecto la añade, va por el mecanismo de secretos y nunca en la configuración versionada, como exige `28-agent-tooling-configuration.md`.
- La skill `context7-mcp`, instalada desde `upstash/context7` con el CLI de skills y fijada en `skills-lock.json`, indica cuándo consultar estas dos herramientas y cómo elegir la librería; la cargan los dos clientes, Claude Code a través del symlink `.claude/skills`. No declara `allowed-tools` ni hooks, así que no concede permisos que registrar en [Skills de agentes](90-agent-skills.md).

Verificado el 2026-09-27: sin API key, el endpoint respondió como `Context7` 4.1.1, listó esas dos herramientas y resolvió una consulta de prueba.

### Datos que salen de la máquina

Cada llamada envía a Upstash el nombre de la librería y el texto de la consulta, que redacta el agente. No envía archivos del repositorio, pero la consulta puede describir el proyecto, y como el backend es privado, su repositorio no documenta cómo trata esos datos. Por eso las consultas no llevan secretos, datos personales ni detalles internos del producto, como exige `08-storage-and-secrets.md`.

### Aprobación en cada cliente

- Claude Code pide aprobación, en las sesiones interactivas, antes de usar un servidor declarado en `.mcp.json`; `claude mcp reset-project-choices` borra las elecciones hechas.
- Codex solo carga `.codex/config.toml` cuando la persona confía en el proyecto.

## Retirar o desactivar un servidor

- Un proyecto derivado lo retira borrando su entrada de `.mcp.json` y su tabla `[mcp_servers.<nombre>]` de `.codex/config.toml` en el mismo cambio, y su fila y su sección de este archivo.
- Para desactivarlo sin borrar su configuración, Codex acepta `enabled = false` en su tabla, y Claude Code, el nombre del servidor en la lista `disabledMcpjsonServers` de sus ajustes; en `.claude/settings.local.json` solo afecta a una persona.

## Añadir otro servidor

1. Verifica quién lo publica, qué datos recibe y qué herramientas expone, según `07-dependencies-and-binaries.md`.
2. Decláralo en `.mcp.json` y en `.codex/config.toml`, o explica aquí por qué un cliente queda fuera, como pide `28-agent-tooling-configuration.md`.
3. Añade su fila al registro y su sección, con la fecha de verificación.
