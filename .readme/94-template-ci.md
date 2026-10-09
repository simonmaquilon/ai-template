# CI de la plantilla

El workflow `.github/workflows/template-checks.yml` comprueba en GitHub Actions que los scripts y los hooks de la plantilla funcionan en Windows y Linux. macOS se valida en local. Los sistemas soportados y sus requisitos están en [Hooks de agentes](92-agent-hooks.md).

Este CI, `run-checks.mjs` con sus pruebas y este documento solo validan la plantilla: nunca se adoptan en un proyecto derivado y sus cambios no suben `.agents/template-version`, como fija [Adopción de versiones de la plantilla](96-template-adoption.md).

## Qué ejecuta

Un único paso, `node .scripts/run-checks.mjs --base <revisión>`, que también se ejecuta en local desde cualquier carpeta del repositorio, con o sin `--base`; en Claude Code, solo si se lanza sin otros comandos desde la raíz, como explica [Sandbox de agentes](91-agent-sandbox.md). Termina con código 1 si falla algo, y con código 3 si lo único que hubo fue un paso que el entorno bloqueó, que informa como `BLOCKED` sin darlo por pasado ni fallido:

- las pruebas de `.scripts/tests/`, con el runner de pruebas que incluye Node y sin dependencias, entre ellas las de los hooks de staging por texto y por efecto y la limpieza de carpetas con preservación de contenido, metadatos Git y directorios bloqueados, además de los avisos de seguridad, su JSON de contexto para ambos clientes y sus límites de lectura y exposición de datos, y la ejecución de herramientas en la versión que fija `STACK.md`, sin red, con argumentos que ninguna shell reinterpreta y con la caché de npm en `.temp`, el lanzador del navegador, que instala una sola vez la versión fijada de Playwright en una caché de la persona, la ejecuta desde la raíz y rechaza sin lanzar nada los comandos, opciones, direcciones, sesiones y rutas que saldrían de la página o del repositorio, y una configuración de la CLI distinta de la esperada; los auxiliares de verificación que la skill `prompt-plan` copia en cada plan, que ejecutan una sola vez la comprobación con el servidor en marcha, dejan pasar el error de esa comprobación, paran el servidor con los procesos que inició y dan la ruta de la evidencia relativa a la raíz del repositorio; además de la regeneración de los bloques de `STACK.md`, que conserva las notas, no copia credenciales, hashes ni argumentos, no lee fuera del repositorio y procesa workflows grandes en tiempo lineal, y del propio `run-checks.mjs`, que informa como `BLOCKED` las pruebas de hooks cuando git no puede crear repositorios, y esas y las de la skill cuando no puede escribir en `.temp/`;
- la integridad de la skill `security-audit` contra `computedHash` en `skills-lock.json`, con el checksum de su licencia adicional verificado por separado;
- los tests vendorizados `validate-findings.test.cjs` y `validate-coverage-ledger.test.cjs` de esa skill, con sus fixtures temporales dentro de `.temp/` y sin iniciar una auditoría. En Windows se informan como `SKIP` y no se ejecutan: sus validadores rechazan cualquier entrada cuando Node no ofrece `O_NOFOLLOW` y `O_NONBLOCK`;
- la comprobación de enlaces de `.scripts/check-doc-links.mjs`, que aquí falla si informa de algo;
- la comprobación de la estructura de las instrucciones y de los prefijos de `.readme/` de `.scripts/check-instructions.mjs`, que también falla si informa de algo;
- el límite de líneas de `.scripts/check-file-length.mjs`, sobre los archivos que cambian respecto a la revisión de `--base`; sin `--base` revisa solo los cambios sin commitear respecto a `HEAD`, que en el checkout limpio del CI no existen.

Las pruebas de salida verifican el contrato JSON documentado de los hooks; no realizan una sesión real de modelo ni prueban la inserción en el transcript del cliente. Las pruebas lanzan cada hook como lo lanza su cliente en ese sistema: Claude Code, en forma exec con `node`; Codex, con `/bin/sh -c` en Linux y macOS —no con la shell de `$SHELL` (`-lc`) que usa si la persona tiene otra, que por eso tiene que ser compatible con sh, como explica [Hooks de agentes](92-agent-hooks.md)— y con `cmd.exe /C` en Windows; en Linux y macOS también pasan `commandWindows` por `/bin/sh -c` para comprobar su lógica. Lo hacen desde la raíz, desde una subcarpeta y, en ambos clientes, desde un repositorio independiente anidado sin `.scripts/` propios, donde no deben actuar, en repositorios git desechables que crean bajo `.temp/` y borran al terminar. Si uno no llega a crearse, la prueba se detiene, y git no busca repositorios por encima de `.temp/`, así que ninguna prueba puede alcanzar el repositorio que las contiene.

## Cuándo y dónde

- Se ejecuta en cada push a `main` y en cada pull request contra `main`, solo si el repositorio está marcado como plantilla en GitHub (Settings > General > Template repository): el job comprueba `github.event.repository.is_template` y no nombra ningún propietario ni repositorio, así que sigue funcionando si la plantilla cambia de sitio. En cualquier otro repositorio que conserve una copia del archivo, GitHub omite el job.
- La revisión base es la del pull request (`github.event.pull_request.base.sha`) o la que tenía `main` antes del push (`github.event.before`); el checkout trae el historial de todas las ramas y etiquetas (`fetch-depth: 0`) para que exista.
- Si git no resuelve esa revisión, como el head anterior a un force push, que ya no está en ninguna rama y el checkout no trae, el script lo avisa y compara con el padre de `HEAD`, así que ese run solo revisa el último commit; sin padre, cuenta todos los archivos como nuevos.
- Matriz: Linux y Windows; las imágenes de runner y la versión de Node las fija el workflow.
- El token del workflow solo tiene permiso de lectura (`contents: read`).
- Las acciones se fijan por SHA en el workflow, con su versión en un comentario, como pide `26-automated-workflows.md`; cada SHA se verifica contra la release publicada en GitHub al fijarlo.

En un repositorio privado, cada ejecución consume los minutos de Actions incluidos en el plan de la cuenta, y los de Windows cuestan más que los de Linux.

## A demanda en el repositorio de la plantilla

En el repositorio de la plantilla el workflow está desactivado en GitHub, así que los pushes y los pull requests no lo lanzan ni gastan minutos. Se ejecuta a demanda:

1. Actívalo con `gh workflow enable template-checks.yml`.
2. Haz push a `main` o abre un pull request contra `main`: son los únicos eventos que lo lanzan, porque el workflow no admite ejecución manual. `gh run watch` sigue el run.
3. Desactívalo de nuevo con `gh workflow disable template-checks.yml`.

Activarlo o desactivarlo es un ajuste de GitHub, no del repositorio.
