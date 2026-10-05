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

### Configuración de la plantilla

`.claude/settings.json` activa el sandbox con estos ajustes:

- `enabled` y `autoAllowBashIfSandboxed`: cada comando corre confinado y se aprueba sin preguntar; solo escribe en el proyecto y en el temporal del sistema.
- `excludedCommands: ["node .scripts/run-checks.mjs*"]`: los checks de la plantilla corren fuera del sandbox. Sus pruebas crean repositorios git desechables y copias de `.mcp.json` bajo `.temp/`, y el sandbox no deja escribir `.git/config`, `.git/hooks/` ni `.mcp.json` en ninguna carpeta, así que dentro fallan siempre. Solo actúa en la plantilla, la única que tiene `run-checks.mjs`; en un proyecto derivado no coincide con ningún comando. Solo sale la invocación lanzada sola desde la raíz, sin las formas que la mantienen confinada, y las propias pruebas impiden que git salga de `.temp/` si no llega a crear un repositorio.
- `network.allowedDomains: ["*"]`: salida a cualquier dominio sin confirmación.
- `network.allowLocalBinding`: en macOS permite levantar servidores en `127.0.0.1`, como hacen los runners de pruebas.
- Sin `filesystem.denyRead`: por decisión del usuario, el sandbox puede leer las credenciales del equipo (`~/.ssh`, `~/.aws`, los tokens de `gh` o `wrangler`) por si una tarea las necesita.
- `permissions.deny` bloquea comandos de sistema que ninguna tarea necesita (`sudo`, `dd`, `mkfs`, `shutdown`…). Comparan prefijos de texto, así que no sustituyen al confinamiento.
- `permissions.ask` pide confirmación solo para las acciones remotas que pueden destruir algo o no se deshacen: `git push`, fusionar o cerrar un PR (cerrarlo puede borrar su rama), y los `gh` de releases, repositorios, ejecución de workflows y secretos, además de `npm publish`. Crear un PR no la pide, porque no destruye nada. Tampoco la piden las acciones locales: borrar archivos dentro del proyecto (`rm -r`), reescribir el historial (`git rebase`), borrar ramas ni descartar cambios sin commit (`git reset --hard`, `git clean`, `git checkout --`, `git restore`, `git stash drop`). Estas últimas pueden perder trabajo de otra sesión que git no recupera, así que las reglas de aprobación de las instrucciones siguen exigiendo autorización para ellas.

Las cachés de los gestores de paquetes viven bajo `.temp/` para no abrir escrituras fuera del proyecto. El `.npmrc` de la raíz fija `cache=.temp/npm-cache`, pero npm solo lee el `.npmrc` de su carpeta de proyecto, la más cercana hacia arriba con `package.json` o `node_modules`, o la actual si no hay ninguna, y resuelve esa ruta desde la carpeta en la que se ejecuta. Desde una subcarpeta, o con el repositorio dentro de otro proyecto de npm, usa otra caché: la de su configuración, fuera del proyecto, o `<subcarpeta>/.temp/npm-cache`. `node .scripts/run-pinned.mjs` no depende de eso: pasa a npm la ruta absoluta de `.temp/npm-cache` en la raíz, se ejecute desde donde se ejecute. Un proyecto con otro gestor apunta la caché de ese gestor a `.temp/<gestor>-cache` en su propio archivo de configuración; si no lo hace, el sandbox bloquea la escritura y el comando se repite fuera del sandbox con confirmación.

## Codex

No existe exención por comando. Las palancas son de sesión completa, en `.codex/config.toml` o por bandera de invocación:

| Ajuste                      | Efecto                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| `sandbox_mode`              | `read-only`, `workspace-write` o `danger-full-access`                             |
| `[sandbox_workspace_write]` | `writable_roots`, `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp` |
| `approval_policy`           | cómo escala a aprobación del usuario un comando denegado                          |
| `default_permissions`       | perfil de permisos por omisión; `:danger-full-access` desactiva el confinamiento  |

La plantilla no declara `sandbox_mode` en `.codex/config.toml`, así que Codex usa sus valores por omisión; se dejó fuera deliberadamente al configurar el sandbox de Claude Code. Por la misma razón, `node .scripts/run-checks.mjs` no tiene en Codex la exención que tiene en Claude Code.

Codex sí evalúa reglas `allow` por comando mediante su exec policy, y una regla `allow` incluye el bypass del sandbox, pero esas reglas se alimentan de `requirements.toml`, que es configuración gestionada por la organización y no se define por proyecto.

## Caso conocido: navegadores bajo macOS

Chromium registra un puerto Mach al arrancar su propio sandbox. Seatbelt —el sandbox de macOS sobre el que se apoyan estos clientes— lo deniega, y cualquier runner que lo controle falla con `Permission denied` antes de levantar la aplicación.

El mensaje parece un arranque E2E roto y no lo es: ningún cambio en la configuración de pruebas, en los navegadores instalados ni en las rutas de caché lo corrige. Tampoco `sandbox.network.allowMachLookup`, que la documentación oficial cita para Playwright: permite buscar servicios Mach, no registrarlos, y Chromium falla al registrar el suyo con `bootstrap_check_in` (comprobado en macOS con `allowMachLookup: ["*"]`). La única salida es que el comando quede fuera del sandbox.
