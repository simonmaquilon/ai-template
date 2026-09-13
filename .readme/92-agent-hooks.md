# Hooks de agentes

Algunas instrucciones enrutadas se hacen cumplir con hooks de los clientes de agente, además de estar escritas. `28-agent-tooling-configuration.md` exige que cada hook llegue a todos los clientes configurados, o que se declare por qué un cliente queda fuera. Este archivo registra qué hook vive en cada cliente y qué hace falta para que se ejecute.

## Registro

| Hook | Evento | Regla que hace cumplir | Claude Code | Codex |
| --- | --- | --- | --- | --- |
| Rechaza el `git add` y el `git commit` en bloque | `PreToolUse`, sobre `Bash` | `27-version-control.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Avisa de directorios vacíos no ignorados | `UserPromptSubmit` | `05-repo-layout.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Avisa de enlaces rotos en la documentación | `UserPromptSubmit` | `17-validation-policy.md` | `.claude/settings.json` | `.codex/hooks.json` |
| Revisión de diseño de Impeccable | `PostToolUse` y `Stop` | — | `.claude/settings.json` | `.codex/hooks.json` |

Los tres primeros usan el mismo comando en los dos clientes. El hook de `git` lee `tool_input.command` como texto o como lista de argumentos, porque los clientes no garantizan la misma forma, y rechaza la llamada saliendo con código 2 y el motivo en stderr. Los de `UserPromptSubmit` imprimen texto plano, que ambos clientes añaden al contexto del modelo, y nunca bloquean. El de Impeccable lo regenera su instalador, como describe [Skills de agentes](90-agent-skills.md).

## Codex: aprobación de los hooks

Codex no ejecuta un hook de proyecto hasta que el usuario lo revisa. Al abrir una sesión con hooks nuevos o modificados muestra un aviso con tres opciones: `Review hooks`, `Trust all and continue` y `Continue without trusting`. Con la última, los hooks quedan desactivados y la sesión sigue sin ellos, sin avisar después.

La aprobación se guarda por hook, como un hash, en la tabla `[hooks.state]` de `~/.codex/config.toml`. Es configuración del usuario y no del repositorio, así que cada máquina y cada persona aprueban por su cuenta.

Cambiar el comando de un hook cambia su hash. Tras adoptar una versión de la plantilla que modifica un hook, Codex vuelve a pedir la aprobación y el hook no se ejecuta hasta darla.

`--dangerously-bypass-hook-trust` ejecuta los hooks sin aprobarlos durante una invocación. No sirve como vía ordinaria: aprobarlos es una decisión sobre qué se ejecuta en la máquina, y `03-approval-boundaries.md` prohíbe sortear un límite de ese tipo.

## Claude Code

Claude Code ejecuta los hooks de `.claude/settings.json` sin aprobación previa. El archivo se versiona para que los hooks lleguen a los proyectos derivados; un proyecto conserva a su lado sus ajustes propios, como las exenciones de sandbox que registra [Sandbox de agentes](91-agent-sandbox.md).
