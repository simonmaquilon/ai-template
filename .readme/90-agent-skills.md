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

Cuando el CLI avisa `Multiple current paths match these skills from <origen>`, omite esa skill en lugar de borrar o migrar la equivocada. Ocurre porque el symlink `.claude/skills` hace que la misma skill resuelva en dos rutas. La skill omitida queda intacta y sigue funcionando con la versión que tenía fijada; actualizarla requiere resolver la ambigüedad de rutas primero.
