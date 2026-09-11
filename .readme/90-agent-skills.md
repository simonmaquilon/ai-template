# Skills de agentes

Las skills de agentes se instalan desde repositorios públicos y se versionan en este repositorio bajo `.agents/skills/`. El archivo `skills-lock.json` en la raíz fija cada skill a su origen y a un hash de integridad.

## Herramienta

Las gestiona el CLI [`vercel-labs/skills`](https://github.com/vercel-labs/skills), que se ejecuta con `npx` sin instalarse como dependencia del proyecto.

## Comandos

```bash
# Actualizar las skills del proyecto a su última versión
npx skills update -p

# Sin prompts interactivos
npx skills update -p -y

# Actualizar una skill concreta
npx skills update nuxt

# Añadir una skill nueva
npx skills add <owner/repo>
```

Opciones de `update`: `-g` solo skills globales, `-p` solo skills del proyecto, `-y` omite el prompt de alcance, y uno o más nombres para acotar a skills concretas.

## Cómo funciona la actualización

El comando resuelve el alcance, lee `skills-lock.json`, descarga los hashes remotos para compararlos, identifica las desactualizadas, reinstala las que cambiaron y reescribe el lockfile. Una skill sin cambios se reinstala igualmente pero conserva su hash.

`computedHash` se calcula sobre el contenido **remoto** en el momento de la instalación, no sobre el archivo local, así que un `sha256` del `SKILL.md` de este repositorio no coincidirá con él.

## Ubicación

Las skills viven en `.agents/skills/`. El directorio `.claude/skills` es un symlink a esa ruta para que el cliente de Claude las descubra.

## Problema conocido: skills omitidas

Cuando el CLI avisa `Multiple current paths match these skills from <origen>`, omite esa skill en lugar de borrar o migrar la equivocada. Ocurre porque el symlink `.claude/skills` hace que la misma skill resuelva en dos rutas. La skill omitida queda intacta y sigue funcionando con la versión que tenía fijada. Hoy le ocurre a `impeccable`, que se actualiza como indica la sección siguiente.

## Actualizar Impeccable

`impeccable` se actualiza con su propio CLI y después se reinstala desde su origen para refrescar su hash en `skills-lock.json`:

```bash
# Actualizar la skill y regenerar sus agentes y hooks
npx impeccable update --project --yes --force

# Reinstalar la skill desde su origen y refrescar su hash en el lockfile
npx skills add pbakaus/impeccable --skill impeccable --agent codex --copy --yes --full-depth
```

`--agent codex --copy` instala solo en `.agents/skills/`, que es la ruta real, y así evita la ambigüedad del symlink. El primer paso deja el binario del motor dentro de la skill y el segundo lo retira: el lanzador `scripts/impeccable` lo descarga y verifica en la caché del usuario, `~/.impeccable/bin/<versión>/`, la primera vez que se ejecuta.

Tras el segundo paso, `npx impeccable check` avisa `Updates available` aunque no exista una versión nueva: la copia del origen difiere de la que genera el CLI de Impeccable, que adapta rutas y comandos a Claude Code. Ese aviso no sirve para saber si hay una actualización.

El instalador escribe además estos archivos fuera de la skill:

- `.claude/agents/impeccable-*.md`: agentes de Claude Code generados; se versionan.
- `.codex/hooks.json`: hook de diseño de Codex; se versiona.
- `.claude/settings.local.json`: hook de diseño de Claude Code; es local a cada máquina y queda fuera del control de versiones.
