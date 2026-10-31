# Adopción de versiones de la plantilla

Un proyecto derivado guarda en `.agents/template-version` la versión de la plantilla que adoptó, con formato `MAJOR.MINOR.PATCH`, y en `.agents/template-manifest.json` el hash de cada archivo de la plantilla en esa versión; `01-meta-guidelines.md` pide cambiar ambos solo al adoptar una versión posterior. Este documento explica cómo crear un proyecto desde la plantilla, cómo adoptarla en un proyecto que ya existe y cómo adoptar después una versión posterior, sin perder el trabajo del proyecto.

La plantilla mantenida es el repositorio cuyo remoto `origin` apunta a `https://github.com/simonmaquilon/ai-template.git`, como fija `01-meta-guidelines.md`; cualquier otro repositorio es un derivado. Por eso un derivado usa su propio `origin` y añade la plantilla como remoto `plantilla`, como muestra «Localizar las versiones».

## Crear un proyecto

Crea el repositorio desde la plantilla y clónalo:

```bash
gh repo create <nombre> --template simonmaquilon/ai-template --private --clone
cd <nombre>
```

Abre el agente dentro de la carpeta nueva e invoca `/start` en Claude Code o `$start` en Codex, como explica [Skills de agentes](90-agent-skills.md): prepara el proyecto y completa sus referencias primarias antes de escribir código.

## Adoptar la plantilla en un proyecto existente

Un proyecto que ya existe, con o sin código, adopta la plantilla extrayendo sus archivos sobre los suyos; uno que ya guarda `.agents/template-version` la adoptó antes y sigue «Traer los cambios», salvo que su versión venga de una numeración anterior, como explica «Numeración anterior de versiones». Hazlo desde la raíz del proyecto y con el árbol de trabajo limpio, para que `git status` muestre cada archivo que la extracción sustituye y se pueda recuperar. En Windows, usa Git Bash con el modo de desarrollador activado, para que se puedan crear enlaces simbólicos.

1. Añade el remoto `plantilla` y trae la versión que vas a adoptar, como muestra «Localizar las versiones»; en los pasos siguientes, `<ref>` es `refs/plantilla/<versión>`.
2. Reúne las skills del proyecto en `.agents/skills/`, donde la plantilla las guarda y las enlaza desde `.claude/skills`:
   - si `.agents/skills` es un enlace, copia su contenido y borra solo el enlace (`rm .agents/skills`, sin barra final), y crea en su lugar una carpeta con esa copia;
   - si `.claude/skills` es una carpeta o un enlace a otra ruta, lleva sus skills a `.agents/skills/`, borra los enlaces de cada skill que ya apuntan allí y quita `.claude/skills`;
   - si una skill del proyecto se llama como una de la plantilla y es la misma skill de origen sin cambios locales, borra la del proyecto y quédate con la de la plantilla; si no, renómbrala, carpeta y nombre, para que la extracción no mezcle sus archivos: queda como skill propia del proyecto, sin entrada en `skills-lock.json`.
3. Guarda fuera del proyecto una copia de los archivos que ocupan una ruta de la plantilla y que Git no puede recuperar porque están ignorados o sin seguimiento, como `.npmrc` o `.mcp.json`. Este comando los lista:

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

   Comprueba después que `.claude/skills` es un enlace con `test -L .claude/skills`; si no lo es, bórralo, recupéralo con `git -c core.symlinks=true checkout <ref> -- .claude/skills` seguido de `git reset -q -- .claude/skills` y repite la comprobación.
5. Añade al `.gitignore` del proyecto, o créalo, las reglas de `git show <ref>:.gitignore` que le falten; se excluye de la extracción para unirlo, no porque solo valide la plantilla. Después, `git ls-tree -r --name-only <ref> | git check-ignore -v --stdin` lista las rutas de la plantilla que el proyecto ignora y la regla que lo hace, también en `.git/info/exclude` o en las exclusiones globales de Git: quita o acota esas reglas, salvo en las rutas que la propia plantilla ignora y versiona, como `.temp/.gitignore`, que se añaden con `git add -f`.
6. Con `git status` y `git diff`, une lo que la extracción sustituyó. Ningún secreto pasa a un archivo versionado (`AGENTS.md`): los tokens y claves de las copias del paso 3 van a la configuración del usuario, como su `.npmrc` personal, o a variables de entorno que el archivo nombra.
   - En los esqueletos de las referencias primarias y de `README.md`, conserva el de la plantilla y lleva el contenido del proyecto a sus secciones.
   - En `AGENTS.md`, conserva el de la plantilla y lleva las reglas propias del proyecto a instrucciones enrutadas desde `AGENTS.md`, registrando como desviación la que se aparte de una regla de la plantilla, como explica `01-meta-guidelines.md`. Haz lo mismo con las de un `CLAUDE.md` del proyecto, en la raíz o dentro de `.claude/`, y bórralo después: Claude Code solo lee `AGENTS.md` cuando no encuentra ningún `CLAUDE.md`, tampoco dentro de `.claude/`, ni `CLAUDE.local.md` en la carpeta de trabajo ni en las superiores, como explica su [documentación](https://code.claude.com/docs/en/memory#agents-md).
   - En `skills-lock.json`, conserva las entradas de la plantilla y copia tal cual las que el proyecto ya tenía con un nombre que la plantilla no usa, sin recalcular ni editar hashes (`03-code-authoring.md`).
   - `.gitattributes` fija finales de línea LF: los archivos del proyecto con CRLF pueden aparecer como modificados; después del commit de la adopción, normalízalos con `git add --renormalize .` en su propio commit.
   - En los demás archivos, incluidas las copias del paso 3, une las reglas de ambos.
7. Deja `.agents/template-version` y `.agents/template-manifest.json` como los trae la extracción: son la versión adoptada y el registro de sus archivos.
8. Comprueba que `node .scripts/check-doc-links.mjs` y `node .scripts/check-instructions.mjs` no informan de nada: corrige o informa de lo que ya fallaba antes de adoptar, y pasa los documentos del proyecto en `.readme/` con prefijo 90 o superior a uno libre por debajo de 90 (`01-meta-guidelines.md`). Luego invoca `/start` o `$start`, que completa las referencias primarias y adapta las herramientas al stack instalado o al que se elija.

## Qué pertenece a la plantilla

Son de la plantilla los archivos que registra `.agents/template-manifest.json`, que `node .scripts/template-manifest.mjs --write` genera en la plantilla mantenida, como fija `12-version-control.md`: todos los versionados salvo los que solo la validan. En resumen:

- `AGENTS.md`, con sus referencias primarias, sus reglas centrales y su tabla de enrutado, salvo su sección Deviations, que es del proyecto, y los módulos de instrucciones de `.agents/instructions/`;
- los esqueletos de `.docs/` (`product.md`, `design.md`, `stack.md`, `plan.md`, `coverage.md`, `bugs.md` y `security.md`) y `README.md`, además del archivo inicial vacío `.docs/backlog.md`, cuyo ciclo de vida gobierna [la instrucción de pendientes](../.agents/instructions/11-pending-work.md);
- la sección Template Tooling de `.docs/stack.md`;
- los documentos de `.readme/` con prefijo 90 o superior;
- la configuración de agentes que declara el repositorio (`.claude/`, `.codex/`, `.mcp.json`, `.npmrc`, `.playwright/`);
- los scripts de `.scripts/`;
- las skills de la base en `.agents/skills/` y su entrada de `skills-lock.json`, que enumera [Skills de agentes](90-agent-skills.md);
- las reglas de la plantilla en `.gitignore`, `.gitattributes` y `.temp/.gitignore`.

Quedan fuera los archivos que solo validan la plantilla: el workflow de CI `template-checks.yml`, el lanzador de checks `run-checks.mjs` con la carpeta `tests` de `.scripts`, los scripts que solo él usa, `check-security-skill.mjs` y `security-skill-hash.mjs`, y el documento que describe ese CI. La lista exacta está en `.scripts/template-manifest.mjs`. Nunca se adoptan, no entran en el manifiesto y no cambian la versión. Un proyecto creado como copia de la plantilla los borra, cosa que hace la skill `start` al prepararlo (si conservara el workflow, GitHub omitiría su job, que solo corre en un repositorio marcado como plantilla), y un proyecto existente no los extrae al adoptarla.

Lo demás es del proyecto: el código, lo que añadió en archivos de la plantilla porque esta lo pide, el contenido con que rellenó las referencias primarias, incluida la sección Project Tooling de `.docs/stack.md`, las skills del catálogo opcional que instaló, sus documentos de `.readme/` por debajo de 90 y sus políticas propias, enrutadas y registradas como desviaciones en `AGENTS.md`.

## Localizar las versiones

Cada versión publicada de la plantilla es una etiqueta `MAJOR.MINOR.PATCH`, sin `v` delante. Una versión MAJOR obliga a migrar algo del proyecto; una MINOR solo añade; una PATCH corrige. Añade la plantilla como remoto, lista sus versiones y trae la que quieres adoptar a un espacio de nombres propio, para que sus etiquetas no se mezclen con las del proyecto:

```bash
git remote add plantilla <url de la plantilla>
git ls-remote --tags plantilla
git fetch plantilla "refs/tags/<versión>:refs/plantilla/<versión>"
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

Trae la versión nueva como muestra «Localizar las versiones» y clasifica cada archivo de la plantilla con:

```bash
node .scripts/template-manifest.mjs --compare refs/plantilla/<versión-nueva>
```

Compara el manifiesto que adoptaste, tus archivos y el manifiesto de la versión nueva, sin escribir nada, y agrupa las rutas por acción:

- `take`, `add` y `delete`: el proyecto no las tocó, así que toma la versión nueva con `git restore --source=refs/plantilla/<versión-nueva> -- <ruta>`, que también borra el archivo si la versión nueva lo retiró.
- `merge` y `review`: el proyecto las modificó, por una desviación registrada en `AGENTS.md` o porque la propia plantilla pide adaptarlo, como las concesiones del catálogo de [Skills de agentes](90-agent-skills.md), los plugins de [Servidores de lenguaje de agentes](93-agent-language-servers.md), los servidores de [Servidores de herramientas de agentes](95-agent-tool-servers.md), las exenciones de sandbox de [Sandbox de agentes](91-agent-sandbox.md), los hooks propios registrados en [Hooks de agentes](92-agent-hooks.md) o sus reglas de `.gitignore` y `.gitattributes` y su `.npmrc`, aplica el cambio de la plantilla a mano y conserva lo del proyecto.
- En las referencias primarias ya rellenadas, nunca tomes el esqueleto nuevo. Traslada solo los cambios de estructura: secciones o columnas nuevas, renombradas o retiradas, marcadores y textos de guía. Mueve el contenido existente a su nuevo sitio, también cuando pasa de una referencia primaria a otra, y deja con `TODO` lo que falte por decidir.
- En `.docs/stack.md`, toma entera la sección Template Tooling de la versión nueva y trata el resto, incluida Project Tooling, como una referencia primaria rellenada. Los bloques entre marcas `stack:generated` no se fusionan a mano: conserva sus marcas y sus notas, y el hook de `.docs/stack.md` los regenera en el siguiente turno de un agente, o `node .scripts/sync-stack.mjs` si lo ejecutas tú.
- De las skills, trae solo las carpetas de `.agents/skills/` que cambió la plantilla y sus entradas de `skills-lock.json`, copiadas tal como están en la versión nueva, sin recalcular ni editar hashes (`03-code-authoring.md`); conserva las skills que añadió el proyecto, no restaures las que retiró y revisa los permisos y hooks que se conceden las que cambian, como pide [Skills de agentes](90-agent-skills.md).
- Si la versión nueva retira una instrucción, bórrala junto con su entrada de enrutado, sin reutilizar su prefijo (`01-meta-guidelines.md`).
- Si una instrucción nueva de la plantilla usa el prefijo de una instrucción propia del proyecto, `.scripts/check-instructions.mjs` lo avisa: la de la plantilla conserva su prefijo, y la del proyecto pasa a uno libre, con su entrada de enrutado y todas sus citas actualizadas.

En el mismo cambio, fija en `.agents/template-version` la versión adoptada, toma su manifiesto con `git show refs/plantilla/<versión-nueva>:.agents/template-manifest.json > .agents/template-manifest.json` y registra en la sección Deviations de `AGENTS.md` cada desviación deliberada que conserves, con el enlace a la política del proyecto que la sustituye.

## Después de adoptar

- `node .scripts/check-doc-links.mjs` y `node .scripts/check-instructions.mjs` no informan de nada. El segundo no cuenta como retirados los archivos de instrucciones ni los documentos de `.readme/` que el proyecto borró hasta el commit que añadió por primera vez `.agents/template-version`, ese incluido: eran del conjunto que la plantilla sustituyó, así que sus prefijos quedan libres.
- Codex vuelve a pedir la aprobación de los hooks que cambiaron, como explica [Hooks de agentes](92-agent-hooks.md).
- Los binarios de los servidores de lenguaje siguen instalados en la versión que fija [stack.md](../.docs/stack.md); si cambió, se reinstalan como explica [Servidores de lenguaje de agentes](93-agent-language-servers.md).
