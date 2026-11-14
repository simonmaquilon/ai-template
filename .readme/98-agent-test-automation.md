# Automatización de pruebas con agentes

La plantilla ofrece exactamente dos herramientas de automatización y cada una tiene dos usos que se mantienen separados: las pruebas automatizadas del proyecto y las sesiones que opera el agente. Este documento fija ese reparto, cómo añade el proyecto Playwright para sus pruebas, cómo se ejecutan esas pruebas bajo el sandbox y las lecciones que valen para cualquier proyecto. Los valores concretos (puertos, estado compartido, fallos intermitentes conocidos, cuentas de prueba, comandos) los declara cada proyecto en sus propios documentos; donde un proyecto no declara nada, la regla se omite en lugar de fallar.

## Herramientas y usos

| Herramienta | Pruebas automatizadas del proyecto | Sesiones que opera el agente |
| --- | --- | --- |
| Playwright | Web y API en esta entrega; Electron, pendiente de una versión posterior | Web, con el [lanzador del navegador](90-agent-skills.md#lanzador-del-navegador) |
| Appium con WebdriverIO | Android e iOS, pendiente de una versión posterior | Pendiente de una versión posterior |

- Las pruebas del proyecto las escribe y las mantiene el proyecto, corren en su CI y cuentan como cobertura en `.docs/coverage.md`. Las sesiones del agente verifican de forma interactiva y nunca cuentan como cobertura (`04-validation-and-testing.md`).
- La skill `start` elige entre las dos herramientas con la evidencia del proyecto (superficie web, API, aplicación de escritorio o aplicación móvil) y registra la decisión en la línea «Extremo a extremo» de `.docs/plan.md`; si queda pendiente, en `.docs/backlog.md`. `start` no instala nada, tampoco después de elegir, y nunca crea archivos de configuración ni de pruebas: la dependencia y esos archivos los añade el proyecto después con su gestor de paquetes, con la aprobación que `06-dependencies-and-stack.md` exige para una dependencia.
- Esta entrega no trae instrucciones de uso de Appium ni de Electron; el documento se ampliará cuando lleguen.

## Playwright para las pruebas del proyecto

### Cómo lo añade el proyecto

Playwright es una dependencia de desarrollo del proyecto, que la añade con su propio gestor de paquetes (`03-code-authoring.md` establece cuál es). No se escribe ningún número de versión a mano: el gestor resuelve la última versión estable y el lockfile del proyecto la fija. La [introducción oficial](https://playwright.dev/docs/intro) añade el paquete de pruebas y los navegadores con estos comandos, que con otro gestor tienen su equivalente:

```bash
npm install -D @playwright/test
npx playwright install
```

Los navegadores que descarga ese segundo comando son un binario más del proyecto (`06-dependencies-and-stack.md`) y los instala el proyecto, no la plantilla.

### Ejemplo mínimo

Es texto de este documento, no un archivo del repositorio; cada `<…>` lo declara el proyecto. La configuración sigue la [referencia de configuración](https://playwright.dev/docs/test-configuration) y el paralelismo, la de [paralelismo](https://playwright.dev/docs/test-parallel).

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '<carpeta de las pruebas>',
  // Los archivos corren en paralelo; con esta opción también las pruebas de un mismo archivo.
  fullyParallel: true,
  // Falla la corrida si queda un test.only olvidado.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    // Las rutas relativas de page.goto y de request se resuelven contra esta base.
    baseURL: '<URL base del servidor de pruebas>',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Arranca el servidor de la aplicación antes de las pruebas y espera a que responda en la URL.
  webServer: {
    command: '<comando que arranca el servidor de pruebas>',
    url: '<URL base del servidor de pruebas>',
    reuseExistingServer: !process.env.CI,
  },
});
```

La prueba web crea sus datos por la API y los borra al terminar, como pide la lección (a). El fixture `request` de una prueba comparte la configuración de `use`, y la [guía de pruebas de API](https://playwright.dev/docs/api-testing) usa el mismo patrón de preparar y limpiar con `request.post` y `request.delete`:

```ts
// <carpeta de las pruebas>/registro.spec.ts
import { test, expect } from '@playwright/test';

let id: string;

test.beforeEach(async ({ request }, testInfo) => {
  // Un nombre único por prueba evita choques entre pruebas paralelas.
  const created = await request.post('<ruta que crea el registro>', { data: { name: `prueba-${testInfo.testId}` } });
  expect(created.ok()).toBeTruthy();
  ({ id } = await created.json());
});

// Se ejecuta aunque la prueba falle, así que no quedan datos huérfanos.
test.afterEach(async ({ request }) => {
  await request.delete(`<ruta del registro>/${id}`);
});

test('la pantalla muestra el registro creado', async ({ page }, testInfo) => {
  await page.goto('<ruta de la pantalla>');
  await expect(page.getByText(`prueba-${testInfo.testId}`)).toBeVisible();
});
```

La prueba de API no abre navegador, así que no depende de lo que rinda la interfaz:

```ts
// <carpeta de las pruebas>/api.spec.ts
import { test, expect } from '@playwright/test';

test('el listado incluye el registro creado', async ({ request }, testInfo) => {
  const name = `prueba-${testInfo.testId}`;
  const created = await request.post('<ruta que crea el registro>', { data: { name } });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();

  try {
    const listing = await request.get('<ruta del listado>');
    expect(listing.ok()).toBeTruthy();
    expect(await listing.json()).toContainEqual(expect.objectContaining({ name }));
  } finally {
    await request.delete(`<ruta del registro>/${id}`);
  }
});
```

Las pruebas que cambian estado global van aparte (lección (b)): en su propio archivo o proyecto de Playwright, que se lanza con `npx playwright test --workers=1`, según la página de paralelismo. `test.describe.configure({ mode: 'serial' })` ordena las pruebas de un archivo, pero no impide que otros archivos corran en otros workers, y la propia documentación lo desaconseja.

### Relación con el lanzador del agente

Son independientes. Las pruebas usan la versión que fija el lockfile del proyecto y los navegadores que el proyecto instala. El [lanzador del navegador](90-agent-skills.md#lanzador-del-navegador) usa la versión de `.agents/tool-versions.json` y el Chrome del equipo, y solo sirve a las sesiones del agente. Actualizar una no actualiza la otra, y un proyecto que adopta solo las pruebas no necesita el lanzador, ni al revés.

## Sandbox

- El runner que arranca un navegador no corre dentro del sandbox en macOS: es el [caso conocido de los navegadores](91-agent-sandbox.md#caso-conocido-navegadores-bajo-macos). El fallo (`Permission denied` antes de levantar la aplicación) parece un arranque roto y no lo es: ningún cambio en la configuración de pruebas, en los navegadores instalados ni en las cachés lo corrige.
- La inspección de procesos tampoco funciona confinada, según el [caso conocido de inspección de procesos](91-agent-sandbox.md#caso-conocido-inspección-de-procesos): un script que busca un servidor por nombre o por su línea de comandos concluye que no existe, mientras que `lsof` sí encuentra quién escucha en un puerto.
- La salida en Claude Code es una exención `sandbox.excludedCommands` para el comando exacto del runner del proyecto, con un espacio antes del `*` final cuando el comando admite argumentos, para no cubrir otros scripts con el mismo prefijo, y con las condiciones de forma que explica [Sandbox de agentes](91-agent-sandbox.md#claude-code). En Codex no hay exención por comando: el runner pide la escalada de su sandbox.
- Riesgo: esa exención ejecuta sin confinar el código del proyecto, es decir, sus pruebas, sus scripts y todo lo que estos invoquen, y `filesystem.denyWrite` no lo protege, así que un comando confinado puede reescribir ese código antes de que corra sin confinar. Por eso se declara solo con autorización explícita.
- La declara `start`, en el mensaje de aprobación de su paso de herramientas, cuando el proyecto adopta pruebas de extremo a extremo con navegador, y solo con un sí explícito; un proyecto que las adopta más tarde la añade con la misma autorización. Se registra en `.readme/91-agent-sandbox.md` de ese proyecto, que es suyo (`.scripts/template-files.mjs` lo lista como propiedad del proyecto), en su sección de exenciones del proyecto si la tiene; la plantilla no define esa sección.

## Lecciones

Cada una es un principio con su porqué y lo que declara el proyecto. `04-validation-and-testing.md` las recoge como reglas; `.docs/plan.md` solo lleva, en su línea «Extremo a extremo», la herramienta, las plataformas y la ruta de la fuente que fija el puerto, el estado compartido y las firmas de fallos intermitentes conocidos; el resto de los valores que cada lección remite al proyecto vive en esa fuente, que es el archivo de configuración del runner o un documento propio del proyecto en `.readme/` por debajo del prefijo 90.

- (a) Cada prueba crea y limpia sus propios datos. Porque una prueba que depende de lo que dejó otra falla según el orden y el paralelismo, y los datos huérfanos contaminan las corridas siguientes. El proyecto declara el estado de partida que sí puede suponerse.
- (b) La prueba que cambia estado global lo declara y no corre en paralelo con otras. Porque las demás leerían un estado que cambia bajo sus pies y fallarían sin que su código tenga fallos. La propia prueba declara en su archivo, o en la configuración del runner, que cambia estado global.
- (c) Solo hay una corrida a la vez sobre un puerto o un estado compartidos. Porque dos corridas sobre el mismo puerto se pisan el servidor y sobre el mismo estado se falsean los datos. El proyecto declara el puerto y el estado compartidos; sin ellos, la regla no aplica.
- (d) Un fallo intermitente se repite aislado antes de tratarlo como real o como conocido. Porque solo la repetición aislada distingue un defecto de un choque con otra prueba, y tratar uno como el otro oculta defectos o inventa ruido. Las firmas de los fallos intermitentes conocidos las declara el proyecto; sin firmas declaradas, ninguno cuenta como conocido.
- (e) Las aserciones negativas quitan identificadores aleatorios, números de orden y fechas antes de comparar. Porque «no contiene X» pasa por casualidad si X lleva un valor que cambia en cada corrida. El proyecto declara qué campos son aleatorios o dependen del orden y de la fecha.
- (f) La evidencia dice qué estados son reales y cuáles simulados. Porque un estado simulado que se lee como real hace pasar por cubierto lo que no se ejercitó. El proyecto declara qué simula y qué ejercita de verdad.
- (g) Una suite larga puede agotar la memoria del servidor de desarrollo o un límite de peticiones, por ejemplo el de inicios de sesión. Se mide por proyecto y se corrige en el proyecto, reutilizando sesiones o subiendo el límite del proceso, nunca relajando la prueba. Porque relajar la prueba esconde el límite en lugar de corregirlo. El proyecto declara sus límites medidos y cómo se reutilizan las sesiones.
- (h) Las cifras de un informe se copian de la salida real y quien delega repite el check. Porque una cifra recordada o resumida puede ser falsa y el informe de quien ejecutó no es evidencia de quien lo recibe (`04-validation-and-testing.md` y `14-delegation.md`).
- (i) Una acción denegada se informa y no se reintenta de otra forma. Porque un límite que se sortea deja de ser un límite y el comando denegado no llegó a ejecutarse (`04-validation-and-testing.md`).
