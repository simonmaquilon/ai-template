# Subagentes de agentes

Claude Code delega tareas en subagentes definidos en `.claude/agents/`, cada uno con su propio modelo y nivel de esfuerzo. Este archivo registra los que declara la plantilla y qué reciben de la sesión que los invoca.

## Registro

| Agente | Uso | Modelo | Esfuerzo |
| --- | --- | --- | --- |
| `sonnet-xhigh` | Agente general para tareas que deben ejecutarse en Sonnet en lugar del modelo de la sesión | `claude-sonnet-5-5` | `xhigh` |

Los agentes `impeccable-*.md` los genera el instalador de la skill Impeccable, como explica [Skills de agentes](90-agent-skills.md).

## Qué heredan

`sonnet-xhigh` no declara `tools`, `skills`, `mcpServers` ni `omitClaudeMd`, así que recibe de la sesión las instrucciones (`CLAUDE.md`, que importa `AGENTS.md`, y las reglas enrutadas), todas las herramientas, incluidas las de los servidores MCP, las skills a través de la herramienta Skill, los hooks de `.claude/settings.json` y los permisos. No recibe el estilo de salida ni la memoria automática de la sesión, y el cuerpo del archivo sustituye al prompt de sistema de Claude Code. Los campos admitidos están en la [documentación de subagentes](https://code.claude.com/docs/en/sub-agents).

## Uso

Claude lo elige por su `description`, o se le pide de forma explícita con `@agent-sonnet-xhigh`. Si quien lo invoca le pasa otro modelo para esa invocación, ese modelo prevalece sobre el del archivo.

## Codex

Codex no declara este agente: los modelos Sonnet no están disponibles en ese cliente.
