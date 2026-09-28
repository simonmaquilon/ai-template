# Sandbox de agentes

Los clientes de agente ejecutan los comandos del modelo dentro de un sandbox del sistema operativo. Un comando que el sandbox deniega **no llegó a ejecutarse**: `17-validation-policy.md` prohíbe reportarlo como comprobación aprobada o fallida, y `28-agent-tooling-configuration.md` pide declarar la exención duradera en lugar de sortearla en cada corrida. Este archivo registra dónde se declara esa exención en cada cliente.

Declarar una exención mueve un límite de permisos, así que requiere autorización bajo `03-approval-boundaries.md`.

## Sistemas

El sandbox de Claude Code existe en macOS, donde usa Seatbelt, y en Linux y WSL2, donde usa bubblewrap. En Windows nativo y en WSL1 no hay sandbox: los comandos no se confinan y las exenciones no tienen efecto.

Codex confina los comandos con los ajustes de la sección de Codex. En Windows su sandbox se activa aparte, con `[windows] sandbox = "elevated"` o `"unelevated"` en el `config.toml`.

## Claude Code

El sandbox se activa con `sandbox.enabled` en `.claude/settings.json`; mientras esté apagado no confina nada y una exención no tiene efecto. Ambos viven en la misma clave:

```json
{
  "sandbox": {
    "enabled": true,
    "excludedCommands": ["<invocación del script de E2E>*"]
  }
}
```

Los patrones son globs sobre la cadena del comando, y el `*` final cubre las variantes que cuelgan del mismo prefijo. Nombran el comando tal como lo publica el repositorio —`pnpm run test:e2e`, `npm run e2e`, `bun test:e2e`, `deno task e2e`, `make e2e`—, nunca una forma tomada de este documento: `06-commands-and-local-runtime.md` establece cuál es el gestor propietario. Exceptúa el script, no el binario que invoca: el patrón alcanza también a los subprocesos que ese script lance.

Una exención solo saca del sandbox una llamada si cubre todos sus comandos, y algunas formas siguen confinadas aunque los cubra, entre otras: una llamada con `cd`, `pushd` o `popd`, una sustitución de comandos, un subshell o un bloque de control, una redirección que no se limite a duplicar un descriptor como `2>&1`, o un comando que empiece por `sudo`, `eval` o `xargs`. Así, una tubería hacia `tail` o una redirección a un log bajo `.temp/` mantienen el script de E2E dentro del sandbox, y falla igual que sin exención.

`excludedCommands` es una lista estática que salta el sandbox sin que el modelo intervenga, distinta del reintento fuera del sandbox que el modelo pide caso por caso y que depende de `sandbox.allowUnsandboxedCommands`. La sesión acepta `/sandbox exclude "<patrón>"` para añadir patrones sin editar el archivo.

## Codex

No existe exención por comando. Las palancas son de sesión completa, en `.codex/config.toml` o por bandera de invocación:

| Ajuste                      | Efecto                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| `sandbox_mode`              | `read-only`, `workspace-write` o `danger-full-access`                             |
| `[sandbox_workspace_write]` | `writable_roots`, `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp` |
| `approval_policy`           | cómo escala a aprobación del usuario un comando denegado                          |
| `default_permissions`       | perfil de permisos por omisión; `:danger-full-access` desactiva el confinamiento  |

Codex sí evalúa reglas `allow` por comando mediante su exec policy, y una regla `allow` incluye el bypass del sandbox, pero esas reglas se alimentan de `requirements.toml`, que es configuración gestionada por la organización y no se define por proyecto.

## Caso conocido: navegadores bajo macOS

Chromium registra un puerto Mach al arrancar su propio sandbox. Seatbelt —el sandbox de macOS sobre el que se apoyan estos clientes— lo deniega, y cualquier runner que lo controle falla con `Permission denied` antes de levantar la aplicación.

El mensaje parece un arranque E2E roto y no lo es: ningún cambio en la configuración de pruebas, en los navegadores instalados ni en las rutas de caché lo corrige. Tampoco `sandbox.network.allowMachLookup`, que la documentación oficial cita para Playwright: permite buscar servicios Mach, no registrarlos, y Chromium falla al registrar el suyo con `bootstrap_check_in` (comprobado el 2026-09-27 con Claude Code 2.1.280 en macOS, con `allowMachLookup: ["*"]`). La única salida es que el comando quede fuera del sandbox.
