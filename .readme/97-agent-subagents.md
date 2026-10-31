# Subagentes de agentes

Claude Code y Codex delegan tareas en subagentes que la plantilla declara en `.claude/agents/` y `.codex/agents/`, cada uno con su propio modelo y nivel de esfuerzo. Este archivo registra esos agentes, el nivel de capacidad al que corresponde cada uno, el modelo y el esfuerzo de la sesión principal y qué reciben los agentes de la sesión que los invoca. [Delegación](../.agents/instructions/14-delegation.md) decide qué se delega y a qué nivel: en un cambio normal o de riesgo, la sesión principal investiga, especifica, decide e informa, y reparte el resto entre los niveles. [Tooling de agentes](../.agents/instructions/13-agent-tooling.md) fija con qué esfuerzo se declara cada nivel, sin nombrar modelos; este registro asigna cada nivel a un agente de cada cliente.

## Registro

| Agente | Cliente | Nivel | Uso | Modelo | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
| `copilot-haiku` | Claude Code | rápido (`fast`) | Exploración, búsqueda y análisis de solo lectura, incluidas las preguntas independientes repartidas en subagentes paralelos | el que fija `.claude/agents/copilot-haiku.md` | `xhigh` |
| `copilot-sonnet` | Claude Code | estándar (`standard`) | Implementación, depuración, refactors y cambios en varios archivos con los criterios de aceptación ya fijados | el que fija `.claude/agents/copilot-sonnet.md` | `xhigh` |
| `copilot-opus` | Claude Code | fuerte (`strong`) | Arquitectura, revisiones, decisiones difíciles, trabajo especializado de seguridad, datos o contratos, y la verificación independiente | el que fija `.claude/agents/copilot-opus.md` | `high` |
| `copilot_luna` | Codex | rápido (`fast`) | El mismo que `copilot-haiku` | el que fija `.codex/agents/copilot-luna.toml` | `max` |
| `copilot_terra` | Codex | estándar (`standard`) | El mismo que `copilot-sonnet` | el que fija `.codex/agents/copilot-terra.toml` | `max` |
| `copilot_sol` | Codex | fuerte (`strong`) | El mismo que `copilot-opus` | el que fija `.codex/agents/copilot-sol.toml` | `high` |

Los agentes de Claude Code declaran el modelo con un alias (`haiku`, `sonnet`, `opus`), que según la [configuración de modelos](https://code.claude.com/docs/en/model-config) apunta a la versión recomendada para el proveedor y se actualiza sola cuando sale una nueva; en Amazon Bedrock o Google Cloud, `haiku` y `sonnet` resuelven hoy a versiones anteriores. Los de Codex no tienen alias y fijan el ID del modelo.

Los esfuerzos siguen la regla de `13-agent-tooling.md`: un nivel con un modelo más capaz que el del nivel de abajo lleva un esfuerzo que no supera el de este, como Sonnet con el mismo `xhigh` que Haiku y Opus con `high` en Claude Code, y en Codex `copilot_terra` con el mismo `max` que `copilot_luna` y `copilot_sol` con `high`; uno con el mismo modelo llevaría más; la sesión principal queda por encima del agente fuerte, como la de Codex, también en Sol, con `max` sobre el `high` de `copilot_sol`. Así ningún esfuerzo se repite dentro de un mismo modelo, y la elección de cada tarea empieza por el nivel rápido.

## Sesión principal

La sesión principal planifica, orquesta, descompone el trabajo y toma las decisiones finales; delega el resto según la regla de delegación.

| Cliente | Modelo | Esfuerzo | Dónde se fija |
| --- | --- | --- | --- |
| Claude Code | el que fija `.claude/settings.json` | `xhigh` | `model` y `effortLevel` en `.claude/settings.json` |
| Codex | el que fija `.codex/config.toml` | `max` | `model` y `model_reasoning_effort` en `.codex/config.toml` |

En Claude Code, el `model` del proyecto se vuelve a aplicar en cada arranque y `/model` solo lo cambia en esa sesión. El `effortLevel` del proyecto vale para cualquier modelo y no admite `max`. El `effort` de cada agente prevalece sobre el de la sesión. Para cambiar el modelo o el esfuerzo en una sola máquina se usa `.claude/settings.local.json`, como explica la [documentación de modelos](https://code.claude.com/docs/en/model-config). En Codex, `.codex/config.toml` solo se carga cuando la persona confía en el proyecto, prevalece sobre su configuración y sus perfiles, y solo lo cambian `--model` o `-c` en la línea de comandos, como explica la [configuración avanzada de Codex](https://learn.chatgpt.com/docs/config-file/config-advanced). Que Sol acepte `max` depende de la cuenta.

## Qué heredan

Los agentes `copilot-*` de Claude Code no declaran `tools`, `skills`, `mcpServers` ni `omitClaudeMd`, así que reciben de la sesión las instrucciones (`AGENTS.md`, que Claude Code lee directamente porque el repositorio no tiene `CLAUDE.md`, y las reglas enrutadas), todas las herramientas, incluidas las de los servidores MCP, las skills a través de la herramienta Skill, los hooks de `.claude/settings.json` y los permisos. No reciben el estilo de salida ni la memoria automática de la sesión, y el cuerpo de cada archivo sustituye al prompt de sistema de Claude Code; por eso ese cuerpo solo remite a las instrucciones heredadas, fija los límites de una tarea delegada (toma como fijos la especificación, el alcance y las decisiones recibidos, no delega ni pide verificación independiente, y devuelve las preguntas en lugar de hacérselas al usuario) y dice qué debe traer el mensaje final, lo único que le llega al invocador: hallazgos concisos, las rutas relevantes, la evidencia de cada conclusión, los cambios hechos y los problemas abiertos. Los campos admitidos están en la [documentación de subagentes](https://code.claude.com/docs/en/sub-agents).

`copilot_luna`, `copilot_terra` y `copilot_sol` son roles de agente de Codex: cada archivo define `name`, `description`, `model`, `model_reasoning_effort` y `developer_instructions`, que Codex exige y que les pide seguir `AGENTS.md` y las reglas enrutadas como la sesión principal, y traer lo mismo en su mensaje final. Codex aplica el rol sobre la configuración de la sesión que los lanza, de la que toman el resto, como explica la [documentación de subagentes de Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents). Su `name` usa guion bajo, como los ejemplos de esa documentación, y el nombre del archivo, guion.

## Agentes integrados

La plantilla no sustituye ni configura los agentes integrados de los clientes. En Claude Code, `Explore`, `Plan` y `general-purpose` corren con el modelo de la sesión, y `Explore` y `Plan` empiezan sin las instrucciones del proyecto, según la [documentación de subagentes](https://code.claude.com/docs/en/sub-agents); en Codex, `default`, `worker` y `explorer` heredan el modelo y el esfuerzo de la sesión. La regla de delegación elige entre los agentes que declara el repositorio, así que un integrado solo interviene cuando el flujo del cliente lo usa por sí mismo, como el modo plan de Claude Code, que delega en sus agentes integrados la investigación del código antes de presentar el plan.

## Uso

Cada cliente solo carga su propio directorio de agentes, así que la sesión ve únicamente los de su cliente y usa la fila que le corresponde sin configurar nada: Claude Code los de `.claude/agents/` y Codex los de `.codex/agents/`.

En Claude Code, Claude los elige por su `description`, o se le pide uno de forma explícita con `@agent-copilot-haiku`, `@agent-copilot-sonnet` o `@agent-copilot-opus`. El esfuerzo del archivo prevalece sobre el de la sesión, salvo que la variable de entorno `CLAUDE_CODE_EFFORT_LEVEL` lo fije. Un modelo o un esfuerzo que se pasen en la invocación prevalecen sobre los del archivo, y la regla de delegación sube de nivel cuando un resultado falla por falta de capacidad.

En Codex se lanzan con `spawn_agent` y `agent_type` igual al nombre del rol (`copilot_luna`, `copilot_terra` o `copilot_sol`).

## Codex

Los modelos Haiku, Sonnet y Opus no están disponibles en Codex, así que ese cliente usa sus propios roles: `copilot_luna` en Luna, `copilot_terra` en Terra y `copilot_sol` en Sol. La verificación independiente de `05-independent-verification.md` la hace `copilot_sol`, lanzado con `fork_turns` en `none` para que no herede el historial de la sesión, con solo la especificación, el diff y acceso al repositorio y a sus checks. No edita porque lo exige `05-independent-verification.md`, y como hereda el sandbox de la sesión, las pruebas de hooks pueden salir como `BLOCKED` si ese sandbox protege `.git/`, como explica [Sandbox de agentes](91-agent-sandbox.md); si no se puede lanzar, se informa como hueco de validación.
