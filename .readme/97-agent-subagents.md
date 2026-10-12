# Subagentes de agentes

Claude Code y Codex delegan tareas en subagentes que la plantilla declara en `.claude/agents/` y `.codex/agents/`, cada uno con su propio modelo y nivel de esfuerzo. Este archivo registra esos agentes, el nivel de capacidad al que corresponde cada uno y qué reciben de la sesión que los invoca. [Delegación en subagentes](../.agents/instructions/34-subagent-delegation.md) decide cuándo delegar y en qué nivel, sin nombrar modelos; este registro asigna cada nivel a un agente de cada cliente.

## Registro

| Agente | Cliente | Nivel | Uso | Modelo | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
| `haiku` | Claude Code | rápido (`fast`) | Trabajo acotado y mecánico con una especificación exacta: buscar, listar, leer y resumir archivos, o aplicar una edición ya especificada | el que fija `.claude/agents/haiku.md` | `xhigh` |
| `sonnet` | Claude Code | estándar (`standard`) | Implementación, pruebas y revisiones acotadas con los criterios de aceptación ya fijados | el que fija `.claude/agents/sonnet.md` | `xhigh` |
| `opus` | Claude Code | fuerte (`strong`) | Diseño ambiguo, diagnóstico de causas, trabajo de seguridad, datos o contratos, y la verificación independiente | el que fija `.claude/agents/opus.md` | `xhigh` |
| `luna` | Codex | rápido (`fast`) | El mismo que `haiku` | el que fija `.codex/agents/luna.toml` | `xhigh` |
| `sol` | Codex | estándar (`standard`) | El mismo que `sonnet` | el que fija `.codex/agents/sol.toml` | `xhigh` |

En Codex el nivel fuerte no tiene agente por decisión del mantenedor de la plantilla, que solo declara dos roles en ese cliente, así que la regla de delegación hace ese trabajo en la propia sesión, y la verificación independiente se hace como explica la sección [Codex](#codex).

Los agentes `impeccable-*.md` los genera el instalador de la skill Impeccable, como explica [Skills de agentes](90-agent-skills.md).

## Qué heredan

`haiku`, `sonnet` y `opus` no declaran `tools`, `skills`, `mcpServers` ni `omitClaudeMd`, así que reciben de la sesión las instrucciones (`CLAUDE.md`, que importa `AGENTS.md`, y las reglas enrutadas), todas las herramientas, incluidas las de los servidores MCP, las skills a través de la herramienta Skill, los hooks de `.claude/settings.json` y los permisos. No reciben el estilo de salida ni la memoria automática de la sesión, y el cuerpo de cada archivo sustituye al prompt de sistema de Claude Code. Los campos admitidos están en la [documentación de subagentes](https://code.claude.com/docs/en/sub-agents).

`luna` y `sol` son roles de agente de Codex: cada archivo define `name`, `description`, `model`, `model_reasoning_effort` y `developer_instructions`, que Codex exige y que les pide seguir `AGENTS.md` y las reglas enrutadas como la sesión principal. Codex aplica el rol sobre la configuración de la sesión que los lanza, de la que toman el resto.

## Uso

En Claude Code, Claude los elige por su `description`, o se le pide uno de forma explícita con `@agent-haiku`, `@agent-sonnet` o `@agent-opus`. Si quien lo invoca le pasa otro modelo para esa invocación, ese modelo prevalece sobre el del archivo.

En Codex se lanzan con `spawn_agent` y `agent_type` igual al nombre del rol (`luna` o `sol`).

## Codex

Los modelos Haiku, Sonnet y Opus no están disponibles en Codex, así que ese cliente usa sus propios roles, `luna` y `sol`, y deja sin agente el nivel fuerte por la decisión que explica el [Registro](#registro). La verificación independiente de `31-verification-loop.md` se hace en una sesión nueva no interactiva con `codex exec --ephemeral --sandbox workspace-write`, que recibe solo la especificación y el diff y tiene acceso al repositorio y a sus checks. No edita porque lo exige `31-verification-loop.md`, no porque el sandbox se lo impida, y las pruebas de hooks pueden salir como `BLOCKED` si ese sandbox protege `.git/`, como explica [Sandbox de agentes](91-agent-sandbox.md); si no se lanza, se informa como hueco de validación.
