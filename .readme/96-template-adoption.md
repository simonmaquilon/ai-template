# Adopción de versiones de la plantilla

Un proyecto derivado guarda en `.agents/template-version` la versión de la plantilla que adoptó, con formato `MAJOR.MINOR.PATCH`, y en `.agents/template-manifest.json` el hash de cada archivo de la plantilla en esa versión; `01-meta-guidelines.md` pide cambiar ambos solo al adoptar una versión posterior. Este documento explica cómo crear un proyecto desde la plantilla, cómo adoptarla en un proyecto que ya existe y cómo adoptar después una versión posterior, sin perder el trabajo del proyecto.

La plantilla mantenida es el repositorio cuyo remoto `origin` apunta a `https://github.com/simonmaquilon/ai-template.git` y que tiene en su último commit y en disco su workflow de CI, `.github/workflows/template-checks.yml`, o el documento de `.readme/` que lo describe, como fija `01-meta-guidelines.md`; cualquier otro repositorio es un derivado, y `template-manifest.mjs --write` se niega en él. Un fork o un clon de la plantilla que aún los rastrea y los tiene, con cualquier `origin`, tampoco queda sellado; uno de esos archivos creado a mano en un derivado, sin añadirlo al índice, no cuenta. Por eso un derivado usa su propio `origin` y añade la plantilla como remoto `plantilla`, como muestra «Localizar las versiones».

## Crear un proyecto

Crea el repositorio desde la plantilla y clónalo:

```bash
gh repo create <nombre> --template simonmaquilon/ai-template --private --clone
cd <nombre>
```

Abre el agente dentro de la carpeta nueva e invoca `/start` en Claude Code o `$start` en Codex, como explica [Skills de agentes](90-agent-skills.md): prepara el proyecto y completa sus referencias primarias antes de escribir código. El proyecto nuevo es un derivado, con su propio `origin`, y el sello de la plantilla actúa en él en cuanto la limpieza de `start` borra el workflow y el documento de CI de la plantilla, antes de commitear nada, como explica «Archivos sellados».

## Adoptar la plantilla en un proyecto existente

Un proyecto que ya existe, con o sin código, adopta la plantilla extrayendo sus archivos sobre los suyos; uno que ya guarda `.agents/template-version` la adoptó antes y sigue «Traer los cambios», salvo que su versión venga de una numeración anterior, como explica «Numeración anterior de versiones». Hazlo desde la raíz del proyecto y con el árbol de trabajo limpio, para que `git status` muestre cada archivo que la extracción sustituye y se pueda recuperar. En Windows, usa Git Bash con el modo de desarrollador activado, para que se puedan crear enlaces simbólicos.

Antes del primer paso, marca la adopción en curso, para que el sello de la plantilla no restaure los archivos que la adopción cambia, como explica «Archivos sellados»:

```bash
mkdir -p .temp && date -u +%Y-%m-%dT%H:%M:%SZ > .temp/template-adoption
```

1. Añade el remoto `plantilla` y trae la versión que vas a adoptar, como muestra «Localizar las versiones»; en los pasos siguientes, `<ref>` es `refs/plantilla/<versión>`.
2. Reúne las skills del proyecto en `.agents/skills/`, donde la plantilla las guarda y las enlaza desde `.claude/skills`:
   - si `.agents/skills` es un enlace, copia su contenido y borra solo el enlace (`rm .agents/skills`, sin barra final), y crea en su lugar una carpeta con esa copia;
   - si `.claude/skills` es una carpeta o un enlace a otra ruta, lleva sus skills a `.agents/skills/`, borra los enlaces de cada skill que ya apuntan allí y quita `.claude/skills`;
   - si una skill del proyecto se llama como una de la plantilla y es la misma skill de origen sin cambios locales, borra la del proyecto y quédate con la de la plantilla; si no, renómbrala, carpeta y nombre, para que la extracción no mezcle sus archivos: queda como skill propia del proyecto, sin entrada en `skills-lock.json`.
3. Guarda fuera del proyecto una copia de los archivos que ocupan una ruta de la plantilla y que Git no puede recuperar porque están ignorados o sin seguimiento, como `.npmrc` o `.mcp.json`. Este comando los lista; usa `read -d ''` y la sustitución de procesos `<(...)`, así que requiere bash o zsh, como Git Bash en Windows, y no funciona en `sh` ni en PowerShell:

   ```bash
   git ls-tree -r -z --name-only <ref> | while IFS= read -r -d '' f; do
     { [ -e "$f" ] || [ -L "$f" ]; } && printf '%s\n' "$f"
   done | grep -vxF -f <(git ls-files)
   ```

4. Extrae la plantilla sin su `.gitignore` y sin los archivos que solo la validan, que lista «Qué pertenece a la plantilla». En Windows, ejecuta antes `export MSYS=winsymlinks:nativestrict`, para que `tar` cree enlaces en lugar de copias:

   ```bash
   git archive <ref> -- . ':(exclude).gitignore' \
     ':(exclude).github/workflows/template-checks.yml' ':(exclude).scripts/run-checks.mjs' \
     ':(exclude).scripts/tests' ':(exclude).scripts/check-security-skill.mjs' \
     ':(exclude).scripts/security-skill-hash.mjs' ':(exclude).readme/94-template-ci.md' | tar -xf -
   ```

   Con el sandbox de Claude Code activo, la extracción escribe rutas que ese sandbox protege por omisión, como `.claude/settings.json`, `.claude/agents/`, `.claude/skills` y `.mcp.json`, y también `.scripts/`, `.codex/` y `.agents/skills/` si el proyecto ya declara la protección de la plantilla, y falla en ellas: ejecuta esta extracción, y las restauraciones que escriban esas rutas, fuera del sandbox y con la confirmación normal, como explica [Sandbox de agentes](91-agent-sandbox.md).

   Comprueba después que `.claude/skills` es un enlace con `test -L .claude/skills`; si no lo es, bórralo, recupéralo con `git -c core.symlinks=true checkout <ref> -- .claude/skills` seguido de `git reset -q -- .claude/skills` y repite la comprobación.

   Quita después de `.claude/settings.json` toda entrada de `sandbox.excludedCommands` y de `permissions.allow` que nombre uno de esos archivos: hoy, las cinco de `run-checks.mjs`, que son estas:

   ```text
   sandbox.excludedCommands: node .scripts/run-checks.mjs*
   permissions.allow: Bash(node .scripts/run-checks.mjs), Bash(node .scripts/run-checks.mjs *),
     y las dos reglas PowerShell(...) con los mismos comandos
   ```

   Si el proyecto no adopta la verificación en navegador operada por el agente, quita también `node .scripts/browser.mjs*` de `sandbox.excludedCommands`, vuelve a añadir la entrada si la adopta más tarde y quítala si la retira después. Deja las demás entradas como están. Esa ruta está protegida por el sandbox: edítala fuera del sandbox y con la confirmación normal, como explica [Sandbox de agentes](91-agent-sandbox.md).
5. Añade al `.gitignore` del proyecto, o créalo, las reglas de `git show <ref>:.gitignore` que le falten; se excluye de la extracción para unirlo, no porque solo valide la plantilla. Después, `git ls-tree -r --name-only <ref> | git check-ignore -v --stdin` lista las rutas de la plantilla que el proyecto ignora y la regla que lo hace, también en `.git/info/exclude` o en las exclusiones globales de Git: quita o acota esas reglas, salvo en las rutas que la propia plantilla ignora y versiona, como `.temp/.gitignore`, que se añaden con `git add -f`.
6. Con `git status` y `git diff`, une lo que la extracción sustituyó. Ningún secreto pasa a un archivo versionado (`AGENTS.md`): los tokens y claves de las copias del paso 3 van a la configuración del usuario, como su `.npmrc` personal, o a variables de entorno que el archivo nombra.
   - En los esqueletos de las referencias primarias y de `README.md`, conserva el de la plantilla y lleva el contenido del proyecto a sus secciones.
   - En `AGENTS.md`, conserva el de la plantilla y lleva las reglas propias del proyecto a instrucciones enrutadas desde `AGENTS.md`; como `AGENTS.md` queda sellado, regístralo entonces en la lista de excepciones, junto con cada desviación de una regla de la plantilla, como explican «Archivos sellados» y `01-meta-guidelines.md`. Haz lo mismo con las de un `CLAUDE.md` del proyecto, en la raíz o dentro de `.claude/`, y bórralo después: Claude Code solo lee `AGENTS.md` cuando no encuentra ningún `CLAUDE.md`, tampoco dentro de `.claude/`, ni `CLAUDE.local.md` en la carpeta de trabajo ni en las superiores, como explica su [documentación](https://code.claude.com/docs/en/memory#agents-md).
   - En `skills-lock.json`, conserva las entradas de la plantilla y copia tal cual las que el proyecto ya tenía con un nombre que la plantilla no usa, sin recalcular ni editar hashes (`03-code-authoring.md`).
   - `.gitattributes` fija finales de línea LF: los archivos del proyecto con CRLF pueden aparecer como modificados; después del commit de la adopción, normalízalos con `git add --renormalize .` en su propio commit.
   - En los demás archivos, incluidas las copias del paso 3, une las reglas de ambos.
7. Deja `.agents/template-version` y `.agents/template-manifest.json` como los trae la extracción: son la versión adoptada y el registro de sus archivos.
8. Comprueba que `node .scripts/check-doc-links.mjs` y `node .scripts/check-instructions.mjs` no informan de nada: corrige o informa de lo que ya fallaba antes de adoptar, y pasa los documentos del proyecto en `.readme/` con prefijo 90 o superior a uno libre por debajo de 90 (`01-meta-guidelines.md`). Luego invoca `/start` o `$start`, que completa las referencias primarias y adapta las herramientas al stack instalado o al que se elija.
9. Haz el commit de la adopción, con los archivos adoptados, `.agents/template-version` y `.agents/template-manifest.json` en ese mismo commit, y solo después ciérrala con `node .scripts/check-template-seal.mjs --adoption-end`, que exige ese commit previo. Se niega, sin quitar la marca, y nombra lo pendiente mientras el manifiesto no esté commiteado tal como está, un archivo sellado difiera de él o, sin `refs/plantilla/<versión>` en el git local, no esté en el mismo commit que el manifiesto: tómalo de la plantilla o regístralo en la lista de excepciones, corrige el commit y repítelo.

## Qué pertenece a la plantilla

Son de la plantilla los archivos que registra `.agents/template-manifest.json`, que `node .scripts/template-manifest.mjs --write` genera en la plantilla mantenida, como fija `12-version-control.md`: todos los versionados salvo los que solo la validan. En resumen:

- `AGENTS.md`, con sus referencias primarias, sus reglas centrales y su tabla de enrutado, y los módulos de instrucciones de `.agents/instructions/`;
- los esqueletos de `.docs/` (`product.md`, `design.md`, `stack.md`, `plan.md`, `coverage.md`, `bugs.md` y `security.md`) y `README.md`, además del archivo inicial vacío `.docs/backlog.md`, cuyo ciclo de vida gobierna [la instrucción de pendientes](../.agents/instructions/11-pending-work.md);
- la sección Template Tooling de `.docs/stack.md`;
- los documentos de `.readme/` con prefijo 90 o superior;
- la configuración de agentes que declara el repositorio (`.claude/`, `.codex/`, `.mcp.json`, `.npmrc`, `.playwright/`);
- los scripts de `.scripts/`;
- las skills de la base en `.agents/skills/` y su entrada de `skills-lock.json`, que enumera [Skills de agentes](90-agent-skills.md);
- las reglas de la plantilla en `.gitignore`, `.gitattributes` y `.temp/.gitignore`.

Quedan fuera los archivos que solo validan la plantilla: el workflow de CI `template-checks.yml`, el lanzador de checks `run-checks.mjs` con la carpeta `tests` de `.scripts`, los scripts que solo él usa, `check-security-skill.mjs` y `security-skill-hash.mjs`, y el documento que describe ese CI. La lista exacta es `TEMPLATE_ONLY`, en `.scripts/template-files.mjs`. Nunca se adoptan, no entran en el manifiesto y no cambian la versión. Un proyecto creado como copia de la plantilla los borra, cosa que hace la skill `start` al prepararlo (si conservara el workflow, GitHub omitiría su job, que solo corre en un repositorio marcado como plantilla), y un proyecto existente no los extrae al adoptarla.

Con esos archivos se van las entradas de `.claude/settings.json` que los nombran, la exención de `sandbox.excludedCommands` y las reglas de `permissions.allow` de `run-checks.mjs`: un proyecto derivado las quita, y la plantilla las conserva porque sus mantenedores las necesitan.

Lo demás es del proyecto: el código, lo que añadió en archivos de la plantilla porque esta lo pide, el contenido con que rellenó las referencias primarias, incluida la sección Project Tooling de `.docs/stack.md`, las skills del catálogo opcional que instaló, sus documentos de `.readme/` por debajo de 90 y sus políticas propias, enrutadas y registradas como desviaciones en la lista de excepciones, junto con los archivos sellados que esa lista nombra.

## Archivos sellados

En un proyecto derivado, los archivos de la plantilla quedan sellados. En cada mensaje al agente, el hook del sello, descrito en [Hooks de agentes](92-agent-hooks.md), los compara con `.agents/template-manifest.json`; restaura el que difiere desde su blob en el git local, después de guardar la versión cambiada en `.temp/template-drift/<UTC>/<ruta>`, y pide al agente que avise de qué restauró. Solo restaura rutas que git no ignora y que algo más respalda: la versión adoptada, si `refs/plantilla/<versión>` está en el git local, debe traerlas con ese contenido; si no, el commit que registró el manifiesto debe tenerlas así. De las demás solo avisa. Sin la versión en el git local, los archivos adoptados tienen que ir en el mismo commit que el manifiesto: si no, `--adoption-end` se niega y, si alguien quita la marca a mano, las diferencias posteriores de esos archivos solo se avisan. En un clon superficial, una diferencia ya commiteada antes del límite del clon también se queda en aviso. Por eso conviene conservar en el git local la versión adoptada: `git fetch --no-tags plantilla "refs/tags/<versión>:refs/plantilla/<versión>"`, como muestra «Localizar las versiones», con `<versión>` la de `.agents/template-version`. Con ella, el sello respalda cada archivo por la propia versión, toma de ella el tipo y el bit de ejecución, y avisa de los archivos que trae y el manifiesto no lista. El hook de alcance de escritura impide además que las herramientas de archivo del agente los editen. Así, un cambio a un archivo de la plantilla se hace en la plantilla y llega con una versión nueva.

Son del proyecto, y el sello no los toca, los que `PROJECT_OWNED` lista en `.scripts/template-files.mjs`: `.docs/` entero, `README.md`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`, `.readme/91-agent-sandbox.md`, `.readme/95-agent-tool-servers.md`, `.gitignore`, `.gitattributes` y `skills-lock.json`. Los demás archivos del manifiesto quedan sellados: `AGENTS.md` entero, `.agents/instructions/`, las skills de la base, `.agents/template-version`, `.claude/agents/`, el enlace `.claude/skills`, `.codex/` salvo su `config.toml`, `.scripts/`, los demás documentos de `.readme/` con prefijo 90 o superior, `.markdownlint-cli2.jsonc`, `.npmrc`, `.playwright/cli.config.json` y `.temp/.gitignore`, además del propio manifiesto, que se compara con el de `HEAD`. Lo que el proyecto añade fuera del manifiesto, como sus skills o sus scripts, nunca se toca. De `.claude/settings.json` el hook solo comprueba que siga registrando los hooks de la plantilla, y avisa si falta alguno.

Una desviación deliberada se registra en la lista de excepciones, el archivo `template-exceptions.json` de la carpeta `.agents/`, propio del proyecto, que la plantilla no trae: un objeto JSON cuyas claves son las rutas, o las carpetas terminadas en `/`, que el proyecto se queda, relativas a la raíz, y cuyos valores dicen por qué y enlazan la política del proyecto que sustituye a la de la plantilla. Por ejemplo:

```json
{
  "AGENTS.md": "Enruta .agents/instructions/20-facturacion.md, la política de facturación del proyecto",
  ".markdownlint-cli2.jsonc": "Silencia en overrides la skill propia .agents/skills/informes"
}
```

- Ninguna entrada puede cubrir `.agents/template-manifest.json` ni `.agents/template-version`, que solo cambian al adoptar.
- Si el archivo no es un objeto así, el sello se detiene, no restaura nada y lo avisa en cada mensaje hasta que se corrija.
- Un proyecto que enruta instrucciones propias registra `AGENTS.md`, porque su tabla de enrutado vive ahí, y uno que quita a propósito un hook de la plantilla de `.claude/settings.json` registra el script de ese hook.
- El agente no edita la lista sin el usuario, ni con sus herramientas de archivo ni con una redirección o `tee`: Claude Code pide confirmación y Codex lo deniega, salvo durante una adopción, cuyo procedimiento registra ahí las desviaciones, porque cada entrada saca un archivo del sello.
- Las rutas de la lista son archivos que el proyecto cambió, así que, en la adopción siguiente, `--compare` las muestra como `merge` o `review` si la versión nueva también los cambia, y como `local` si no.

El sello no actúa en una copia de la plantilla, que tiene en su último commit y en disco su workflow o su documento de CI (crear uno de ellos en un derivado pide confirmación en Claude Code y se deniega en Codex), sin manifiesto commiteado, ni mientras exista `.temp/template-adoption`, la marca de adopción en curso: un archivo ignorado, propio de cada copia local, que se crea a mano al empezar una adopción, como el usuario y no el agente, cuyas herramientas de archivo, redirecciones y `tee` piden confirmación en Claude Code o se deniegan en Codex al escribirla, y se quita con `node .scripts/check-template-seal.mjs --adoption-end` al terminarla. Mientras existe, cada mensaje al agente recuerda que la adopción sigue en curso, así que no se queda puesta sin que se note. `--adoption-end` se niega, sin quitarla, mientras el manifiesto no esté commiteado tal como está, no nombre la versión de `.agents/template-version`, la lista de excepciones no sea válida, algún archivo sellado difiera del manifiesto adoptado o no esté commiteado en el mismo commit que el manifiesto, y nombra lo que falta. Sin la marca, un manifiesto de otra versión que el commiteado detiene el sello en lugar de devolver los archivos a la versión anterior.

## Localizar las versiones

Cada versión publicada de la plantilla es una etiqueta `MAJOR.MINOR.PATCH`, sin `v` delante. Una versión MAJOR obliga a migrar algo del proyecto; una MINOR solo añade; una PATCH corrige. Añade la plantilla como remoto, lista sus versiones y trae la que quieres adoptar a un espacio de nombres propio, para que sus etiquetas no se mezclen con las del proyecto:

```bash
git remote add --no-tags plantilla <url de la plantilla>
git ls-remote --tags plantilla
git fetch --no-tags plantilla "refs/tags/<versión>:refs/plantilla/<versión>"
```

Sin `--no-tags`, git trae además, por omisión, las etiquetas de la plantilla que apuntan al historial traído y las crea en `refs/tags/`, junto a las del proyecto. En `git remote add` lo fija para cualquier `git fetch` posterior de ese remoto, y en el `fetch` cubre un remoto `plantilla` añadido sin él; `git config remote.plantilla.tagOpt --no-tags` deja ese remoto como si se hubiera añadido con `--no-tags`. Si un `fetch` anterior ya creó esas etiquetas, este bucle borra solo las locales que apuntan al mismo objeto que la etiqueta de igual nombre en la plantilla, y conserva las del proyecto, también una que se llame como una versión de la plantilla pero apunte a otro commit:

```bash
git ls-remote --tags --refs plantilla | while read -r id ref; do
  [ "$(git rev-parse -q --verify "$ref")" = "$id" ] && git tag -d "${ref#refs/tags/}"
done
```

Si `.agents/template-version` no guarda una versión `MAJOR.MINOR.PATCH`, sigue «Numeración anterior de versiones». Para ver el cambio de la plantilla entre la versión que tienes y la nueva, trae también la tuya y compáralas:

```bash
git diff refs/plantilla/<versión-actual> refs/plantilla/<versión-nueva> --stat
git diff refs/plantilla/<versión-actual> refs/plantilla/<versión-nueva> -- <ruta>
```

## Numeración anterior de versiones

El historial de la plantilla empieza en un único commit con la versión `1.0.0`. Un derivado cuyo `.agents/template-version` guarda un número entero viene de una numeración anterior: no tiene manifiesto ni puede localizar su versión en la plantilla, porque ese historial ya no existe en ella. Ese proyecto no sigue «Traer los cambios»: adopta la versión `1.0.0` con el procedimiento de «Adoptar la plantilla en un proyecto existente», aunque ya tenga el archivo, y el paso 7 le deja esa versión y su manifiesto.

Si el proyecto guarda sus referencias primarias en la raíz, antes de extraer muévelas con `git mv` a `.docs/` con su nombre nuevo: `PRODUCT.md` a `product.md`, `DESIGN.md` a `design.md`, `STACK.md` a `stack.md`, `PLAN.md` a `plan.md`, `TESTS.md` a `coverage.md`, `BUGS.md` a `bugs.md`, `SECURITY.md` a `security.md` y `BACKLOG.md` a `backlog.md`. Así conservan su historial, y al unirlas con los esqueletos nuevos se mantienen sus identificadores, filas y enlaces. Sin `.docs/stack.md`, `run-pinned.mjs` falla y el hook del stack no regenera nada.

Como la extracción solo sobrescribe, antes de ella compara las rutas de la plantilla que enumera «Qué pertenece a la plantilla» con `git ls-tree -r --name-only <ref>` y borra las que la plantilla ya no trae, salvo lo que el proyecto añadió: las instrucciones de `.agents/instructions/` con su numeración anterior, las skills y los agentes que ya no forman parte de la base, y los hooks que una skill retirada escribió en `.claude/settings.json` y `.codex/hooks.json`. Las skills retiradas que el proyecto aún necesita se reinstalan desde el [catálogo opcional](90-agent-skills.md#catálogo-opcional), y sus instrucciones propias con un prefijo que la plantilla usa pasan a uno libre, como indica «Traer los cambios». `check-instructions.mjs` empieza a contar los prefijos retirados después del primer commit que añadió `.agents/template-version`, que aquí es el de la adopción anterior, así que los prefijos que esta adopción retira quedan retirados.

## Traer los cambios

Antes de restaurar nada, marca la adopción en curso con el comando de «Adoptar la plantilla en un proyecto existente»: en cuanto llegan los scripts y los hooks de la versión nueva, el sello actúa en cada mensaje y, sin la marca, devolvería cada archivo al manifiesto que aún está commiteado. Trae la versión nueva como muestra «Localizar las versiones» y clasifica cada archivo de la plantilla con:

```bash
node .scripts/template-manifest.mjs --compare refs/plantilla/<versión-nueva>
```

Compara el manifiesto que adoptaste, tus archivos y el manifiesto de la versión nueva, sin escribir nada, y agrupa las rutas por acción; al final lista como `local` las que solo cambió el proyecto, que no piden acción, y da el recuento de las que no la piden:

- `take`, `add` y `delete`: el proyecto no las tocó, así que toma la versión nueva con `git restore --source=refs/plantilla/<versión-nueva> -- <ruta>`, que también borra el archivo si la versión nueva lo retiró.
- `merge` y `review`: el proyecto las modificó, por una desviación registrada en la lista de excepciones o porque la propia plantilla pide adaptarlo, como las concesiones del catálogo de [Skills de agentes](90-agent-skills.md), los plugins de [Servidores de lenguaje de agentes](93-agent-language-servers.md), los servidores de [Servidores de herramientas de agentes](95-agent-tool-servers.md), las exenciones de sandbox de [Sandbox de agentes](91-agent-sandbox.md), los hooks propios registrados en [Hooks de agentes](92-agent-hooks.md), sus reglas de `.gitignore` y `.gitattributes`, o un archivo sellado que adaptó con una entrada de esa lista, como su `.npmrc`. Aplica el cambio de la plantilla y conserva lo del proyecto con una fusión de tres vías, que toma como base la versión que adoptaste; necesita también `refs/plantilla/<versión-actual>`, que trae «Localizar las versiones»:

  ```bash
  mkdir -p .temp/merge
  git show refs/plantilla/<versión-actual>:<ruta> > .temp/merge/base
  git show refs/plantilla/<versión-nueva>:<ruta> > .temp/merge/theirs
  git merge-file -p <ruta> .temp/merge/base .temp/merge/theirs > .temp/merge/merged
  ```

  `git merge-file -p` escribe el resultado en su salida, sin tocar `<ruta>`, y termina con el número de conflictos como código de salida. Revisa `.temp/merge/merged`, resuelve los bloques entre `<<<<<<<` y `>>>>>>>` si los hay, cópialo sobre `<ruta>` y borra `.temp/merge`. Una ruta `review`, que una de las partes borró, no se fusiona: decide a mano si se queda o se va.
- `local`: el proyecto las cambió y la versión nueva no; no piden acción, pero revisa si alguna es una desviación que aún no figura en la lista de excepciones.
- Con el sandbox de Claude Code activo, un comando de shell que corre dentro de él no puede escribir las rutas que niega: siempre las que Claude Code protege por omisión, como `.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills`, `.claude/agents` y `.mcp.json`, y además las de `sandbox.filesystem.denyWrite` del `.claude/settings.json` del proyecto, que en la plantilla son `.scripts`, `.codex`, `.agents/skills` y `.temp/playwright-cli`. Un proyecto que adopta desde una versión sin esa protección aún no las declara, así que en él `git restore` y `cp` sobre `.scripts/`, `.codex/` y `.agents/skills/` funcionan dentro del sandbox; una vez fusionado el `.claude/settings.json` nuevo, dejan de funcionar. `node -e "console.log(require('./.claude/settings.json').sandbox?.filesystem?.denyWrite ?? [])"` muestra cuáles declara. En una ruta negada, el comando falla con `Operation not permitted` y, con varias rutas en un mismo comando, restaura las demás y deja esa como estaba, así que el paso queda a medias sin que se note: restáurala en un comando aparte, fuera del sandbox y con la confirmación normal, como explica [Sandbox de agentes](91-agent-sandbox.md). No afecta a lo que ejecutas en tu propia terminal ni a las herramientas Edit y Write, que se rigen por las reglas de permisos.
- Si `AGENTS.md` aún tiene la sección Deviations de versiones anteriores, pásala a la lista de excepciones antes de cerrar la adopción: por cada desviación, una entrada con la ruta sellada que el proyecto conserva cambiada, como el módulo de `.agents/instructions/` que modificó, o `AGENTS.md` si la desviación enruta un módulo propio, y como valor el texto de la desviación con su enlace. Después toma el `AGENTS.md` de la versión nueva, que ya no tiene esa sección; si `AGENTS.md` quedó en la lista, aplica a mano el cambio de la plantilla y quita igualmente la sección, porque el registro vive ya en la lista.
- Si el proyecto aún conserva en `.claude/settings.json` las entradas de `sandbox.excludedCommands` y de `permissions.allow` que nombran archivos que solo validan la plantilla, hoy las cinco de `run-checks.mjs`, que muestra el bloque siguiente, quítalas como en «Adoptar la plantilla en un proyecto existente» y deja las demás como están.

  ```text
  sandbox.excludedCommands: node .scripts/run-checks.mjs*
  permissions.allow: Bash(node .scripts/run-checks.mjs), Bash(node .scripts/run-checks.mjs *),
    y las dos reglas PowerShell(...) con los mismos comandos
  ```

- Una vez que el proyecto quitó esas entradas, `.claude/settings.json` cuenta como modificado por el proyecto: las versiones posteriores que cambien `.claude/settings.json` llegan como `merge`, y el proyecto las mantiene fuera al aplicar el cambio de la plantilla.
- En las referencias primarias ya rellenadas, nunca tomes el esqueleto nuevo. Traslada solo los cambios de estructura: secciones o columnas nuevas, renombradas o retiradas, marcadores y textos de guía. Mueve el contenido existente a su nuevo sitio, también cuando pasa de una referencia primaria a otra, y deja con `TODO` lo que falte por decidir.
- Si `.docs/bugs.md` tiene contenido, crea las tablas Activos y Cerrados con las mismas columnas.
- Mueve las filas completas con estado `nuevo`, `reproducido`, `en_curso` o `bloqueado` a Activos y las de estado `resuelto` o `descartado` a Cerrados.
- Si el registro usa los estados en inglés de versiones anteriores, tradúcelos en cada fila: `new` a `nuevo`, `confirmed` a `reproducido`, `in_progress` a `en_curso`, `blocked` a `bloqueado`, `resolved` a `resuelto` y `closed` a `descartado`; en «Corregido en», `pending` pasa a `pendiente` y `none` a `sin corrección`. La severidad y el impacto de seguridad no cambian.
- Conserva cada ID y ruta de test de regresión.
- Compacta opcionalmente la evidencia antigua de un bug cerrado cuando vuelvas a editar su fila; mover filas durante la migración no lo exige.
- No restaures la fila `TODO` sobre el contenido del proyecto.
- Elimina la fila `TODO` de Activos al registrar el primer bug, aunque el bug vaya a Cerrados.
- Conserva el encabezado y delimitador de una tabla sin filas.
- En `.docs/stack.md`, toma entera la sección Template Tooling de la versión nueva y trata el resto, incluida Project Tooling, como una referencia primaria rellenada. Los bloques entre marcas `stack:generated` no se fusionan a mano: conserva sus marcas y sus notas, y el hook de `.docs/stack.md` los regenera en el siguiente turno de un agente, o `node .scripts/update-stack-doc.mjs` si lo ejecutas tú.
- De las skills, trae solo las carpetas de `.agents/skills/` que cambió la plantilla y sus entradas de `skills-lock.json`, copiadas tal como están en la versión nueva, sin recalcular ni editar hashes (`03-code-authoring.md`); conserva las skills que añadió el proyecto, no restaures las que retiró y revisa los permisos y hooks que se conceden las que cambian, como pide [Skills de agentes](90-agent-skills.md).
- Si la versión nueva retira una instrucción, bórrala junto con su entrada de enrutado, sin reutilizar su prefijo (`01-meta-guidelines.md`).
- Si una instrucción nueva de la plantilla usa el prefijo de una instrucción propia del proyecto, `.scripts/check-instructions.mjs` lo avisa: la de la plantilla conserva su prefijo, y la del proyecto pasa a uno libre, con su entrada de enrutado y todas sus citas actualizadas.
- Si fusionaste a mano `.claude/settings.json` o `.codex/hooks.json`, comprueba que existe cada script de `.scripts/` que nombran sus hooks. Si la versión nueva renombra o retira uno y el archivo fusionado sigue nombrando el anterior, ese hook deja de actuar sin avisar: Claude Code lo trata como un error que no bloquea y Codex termina sin hacer nada.

Cierra la adopción en este orden:

1. Toma las rutas `take`, `add` y `delete` y fusiona las `merge` y `review`, como explica la lista anterior.
2. Repite el `--compare` hasta que ninguna ruta siga en `take`, `add` ni `delete`; una que siga ahí no se restauró. Hazlo antes de tomar el manifiesto nuevo: con él ya tomado, esa ruta saldría como `local`.
3. Comprueba que `.agents/template-version` tiene la versión adoptada, que llega como `take`; toma su manifiesto con `git show refs/plantilla/<versión-nueva>:.agents/template-manifest.json > .agents/template-manifest.json`, y registra en la lista de excepciones cada desviación deliberada que conserves, con el enlace a la política del proyecto que la sustituye.
4. Haz el commit de la adopción con todo lo anterior. Sin `refs/plantilla/<versión-nueva>` en el git local, los archivos adoptados, la versión y el manifiesto van en el mismo commit, porque el sello solo respalda lo que guarda el commit que registró el manifiesto, como explica «Archivos sellados».
5. Cierra la adopción con `node .scripts/check-template-seal.mjs --adoption-end`, que exige ese commit: se niega y nombra lo pendiente mientras el manifiesto no esté commiteado tal como está, un archivo sellado difiera de él o le falte ese respaldo. Tómalo de la versión nueva o regístralo en la lista, corrige el commit, por ejemplo con `git commit --amend`, y repítelo.

## Después de adoptar

- `.temp/template-adoption` ya no existe, y el sello vuelve a restaurar los archivos sellados en cada mensaje.
- Un derivado no tiene `run-checks.mjs`, que solo valida la plantilla. Las comprobaciones que viajan con la plantilla, registradas en `.agents/template-manifest.json`, y que solo necesitan `git` y `node`, se ejecutan a mano desde la raíz y no imprimen nada cuando todo está bien:

  ```bash
  node .scripts/check-doc-links.mjs
  node .scripts/check-instructions.mjs
  node .scripts/check-bugs.mjs
  node .scripts/check-markdown.mjs --all
  node .scripts/check-symlinks.mjs
  node .scripts/update-stack-doc.mjs --check
  node .scripts/check-file-length.mjs --base <commit anterior a la adopción>
  ```

  Los demás `check-*.mjs` que trae la plantilla son hooks que leen la entrada de su cliente o que escriben, como el del sello o el de directorios vacíos, y no se ejecutan como comprobación; `template-manifest.mjs --check` solo vale en la plantilla y se niega en un derivado.
- `node .scripts/check-doc-links.mjs` y `node .scripts/check-instructions.mjs` no informan de nada. El segundo no cuenta como retirados los archivos de instrucciones ni los documentos de `.readme/` que el proyecto borró hasta el commit que añadió por primera vez `.agents/template-version`, ese incluido: eran del conjunto que la plantilla sustituyó, así que sus prefijos quedan libres.
- Codex vuelve a pedir la aprobación de los hooks que cambiaron, como explica [Hooks de agentes](92-agent-hooks.md).
- Los binarios de los servidores de lenguaje siguen instalados en la versión que fija [stack.md](../.docs/stack.md); si cambió, se reinstalan como explica [Servidores de lenguaje de agentes](93-agent-language-servers.md).
