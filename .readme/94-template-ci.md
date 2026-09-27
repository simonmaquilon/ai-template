# CI de la plantilla

El workflow `.github/workflows/template-checks.yml` comprueba en GitHub Actions que los scripts y los hooks de la plantilla funcionan en Windows y Linux. macOS se valida en local. Los sistemas soportados y sus requisitos están en [Hooks de agentes](92-agent-hooks.md).

## Qué ejecuta

Un único paso, `node .scripts/run-checks.mjs --base <revisión>`, que también se ejecuta en local desde cualquier carpeta del repositorio, con o sin `--base`, y termina con código 1 si falla algo:

- las pruebas de `.scripts/tests/`, con el runner de pruebas que incluye Node y sin dependencias;
- la comprobación de enlaces de `.scripts/check-doc-links.mjs`, que aquí falla si informa de algo;
- el límite de líneas de `.scripts/check-file-length.mjs`, sobre los archivos que cambian respecto a la revisión de `--base`; sin `--base` revisa solo los cambios sin commitear respecto a `HEAD`, que en el checkout limpio del CI no existen.

Las pruebas lanzan cada hook como lo lanza su cliente en ese sistema: Claude Code, en forma exec con `node`; Codex, con `/bin/sh -c` en Linux y macOS y con `cmd.exe /C` en Windows. Lo hacen desde la raíz y desde una subcarpeta, en repositorios git desechables que crean bajo `.temp/` y borran al terminar.

## Cuándo y dónde

- Se ejecuta en cada push a `main` y en cada pull request contra `main`.
- La revisión base es la del pull request (`github.event.pull_request.base.sha`) o la que tenía `main` antes del push (`github.event.before`); el checkout trae todo el historial (`fetch-depth: 0`) para que exista.
- Matriz: `ubuntu-24.04` y `windows-2025`, con Node 24.
- El token del workflow solo tiene permiso de lectura (`contents: read`).
- Las acciones se fijan por SHA en el workflow, con su versión en un comentario, como pide `26-automated-workflows.md`; se verificaron contra sus releases publicadas en GitHub el 2026-09-27.

En un repositorio privado, cada ejecución consume los minutos de Actions incluidos en el plan de la cuenta, y los de Windows cuestan más que los de Linux.

## A demanda en el repositorio de la plantilla

En el repositorio de la plantilla el workflow está desactivado en GitHub, así que los pushes y los pull requests no lo lanzan ni gastan minutos. Se ejecuta a demanda:

1. Actívalo con `gh workflow enable template-checks.yml`.
2. Haz push a `main` o abre un pull request contra `main`: son los únicos eventos que lo lanzan, porque el workflow no admite ejecución manual. `gh run watch` sigue el run.
3. Desactívalo de nuevo con `gh workflow disable template-checks.yml`.

El ajuste vive en GitHub y no en el repositorio: un proyecto creado desde la plantilla hereda el workflow activo, y correrá en sus pushes y pull requests con sus propios minutos hasta que lo desactive o cambie sus disparadores.
