# Automatización de pruebas con agentes

La plantilla ofrece exactamente dos herramientas de automatización y cada una tiene dos usos que se mantienen separados: las pruebas automatizadas del proyecto y las sesiones que opera el agente. Este documento fija ese reparto, cómo añade el proyecto Playwright para sus pruebas, cómo se ejecutan esas pruebas bajo el sandbox y las lecciones que valen para cualquier proyecto. Los valores concretos (puertos, estado compartido, fallos intermitentes conocidos, cuentas de prueba, comandos) los declara cada proyecto en sus propios documentos; donde un proyecto no declara nada, la regla se omite en lugar de fallar.

## Herramientas y usos

| Herramienta | Pruebas automatizadas del proyecto | Sesiones que opera el agente |
| --- | --- | --- |
| Playwright | Web, API y aplicaciones de escritorio Electron, estas con el soporte que Playwright declara experimental | Web, con el [lanzador del navegador](90-agent-skills.md#lanzador-del-navegador); el lanzador no abre aplicaciones Electron |
| Appium con WebdriverIO | Android e iOS | Android e iOS, con el servidor [`appium-mcp`](95-agent-tool-servers.md#appium-mcp) cuando el proyecto lo declara |

- Las pruebas del proyecto las escribe y las mantiene el proyecto, corren en su CI y cuentan como cobertura en `.docs/coverage.md`. Las sesiones del agente verifican de forma interactiva y nunca cuentan como cobertura (`04-validation-and-testing.md`).
- La skill `start` elige entre las dos herramientas con la evidencia del proyecto (superficie web, API, aplicación de escritorio o aplicación móvil) y registra la decisión en la línea «Extremo a extremo» de `.docs/plan.md`; si queda pendiente, en `.docs/backlog.md`. `start` no instala nada, tampoco después de elegir, y nunca crea archivos de configuración ni de pruebas: la dependencia y esos archivos los añade el proyecto después con su gestor de paquetes, con la aprobación que `06-dependencies-and-stack.md` exige para una dependencia.

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

### Electron

Playwright maneja una aplicación Electron con la clase [`Electron`](https://playwright.dev/docs/api/class-electron), que su documentación declara experimental y limita a Electron 21 o superior; el nombre `_electron`, con guion bajo, lo recuerda. No hay navegador que instalar ni servidor que arrancar: la prueba lanza la aplicación, que ya es una dependencia del proyecto, y `baseURL` y `webServer` no aplican. El ejemplo, con cada `<…>` declarado por el proyecto, sigue la referencia de [`ElectronApplication`](https://playwright.dev/docs/api/class-electronapplication):

```ts
// <carpeta de las pruebas>/ventana.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';

test('la ventana principal responde', async () => {
  // Lanza la aplicación con el Electron que el proyecto tiene instalado.
  const app = await electron.launch({ args: ['<script principal o carpeta de la aplicación>'] });
  try {
    // Espera a la primera ventana, que es una página como las de una prueba web.
    const window = await app.firstWindow();
    await window.getByRole('button', { name: '<nombre del botón>' }).click();
    await expect(window.getByText('<texto esperado>')).toBeVisible();
    // Esta función corre en el proceso principal de Electron, no en la ventana.
    expect(await app.evaluate(({ app }) => app.getName())).toBe('<nombre de la aplicación>');
  } finally {
    // Se cierra aunque la prueba falle, para no dejar la aplicación abierta.
    await app.close();
  }
});
```

Lo que conviene saber antes de adoptarlo, de la documentación oficial y de lo comprobado con esta plantilla en macOS:

- El lanzamiento agota su tiempo si la aplicación empaquetada desactiva el fuse `nodeCliInspect` (`FuseV1Options.EnableNodeCliInspectArguments`); las pruebas necesitan una compilación que lo conserve.
- Los diálogos nativos no se interceptan, porque los abre el proceso principal contra el sistema operativo: la prueba sustituye el método, por ejemplo `dialog.showOpenDialog`, con `app.evaluate`.
- Una terminal abierta desde un editor construido con Electron puede heredar la variable `ELECTRON_RUN_AS_NODE`, con la que Electron arranca como Node y el lanzamiento falla con `Process failed to launch!`. El comando de pruebas del proyecto la quita del entorno; el fallo no está en la prueba ni en la aplicación.
- Electron no arranca dentro del sandbox en macOS, por el mismo motivo que un navegador (sección «Sandbox»), así que el runner necesita la misma exención.
- Cada prueba lanza y cierra su propia aplicación, y los datos que la aplicación guarda en disco son estado compartido como cualquier otro (lecciones (a) y (c)): el proyecto declara la carpeta de datos que usan las pruebas.

Las sesiones del agente no cubren Electron: el lanzador del navegador solo abre navegadores, así que una ventana Electron se verifica con las pruebas del proyecto, y el cierre de un cambio dice esa laguna cuando la verificación interactiva hacía falta.

### Relación con el lanzador del agente

Son independientes. Las pruebas usan la versión que fija el lockfile del proyecto y los navegadores que el proyecto instala. El [lanzador del navegador](90-agent-skills.md#lanzador-del-navegador) usa la versión de `.agents/tool-versions.json` y el Chrome del equipo, y solo sirve a las sesiones del agente. Actualizar una no actualiza la otra, y un proyecto que adopta solo las pruebas no necesita el lanzador, ni al revés. Las capturas y mediciones de una sesión del agente (tamaños, modos de color, desbordamientos, objetivos y foco) las hace el subcomando [`capture`](90-agent-skills.md#captura-y-medición-del-navegador) del lanzador; son verificación interactiva y, como esta, no cuentan como cobertura automatizada.

## Appium con WebdriverIO para las pruebas del proyecto

### Requisitos

`node .scripts/device.mjs doctor` comprueba los de este equipo sin instalar nada. Los fija cada herramienta en su `package.json` y en su documentación, no esta plantilla: la versión de Node que pide WebdriverIO (`npm view webdriverio engines.node`), que es más estricta que la de Appium; un JDK y el SDK de Android, con `ANDROID_HOME` apuntando a él, para Android; y macOS con Xcode y un runtime de simulador instalado para iOS. Un emulador o un simulador es un binario más del equipo y lo instala quien lo usa, no la plantilla.

### Cómo añade el proyecto Appium

El servidor, los drivers y el cliente son dependencias de desarrollo del proyecto y el lockfile fija sus versiones. La [documentación de Appium](https://appium.io/docs/en/latest/guides/managing-exts/) solo admite npm para gestionar los drivers como dependencias: sin `APPIUM_HOME` en el entorno, Appium carga los drivers que declara el `package.json` del proyecto donde corre. El [servicio de Appium de WebdriverIO](https://webdriver.io/docs/appium-service) instala el servidor junto al servicio:

```bash
npm install -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/appium-service appium
npm install -D appium-uiautomator2-driver@<línea compatible>
npm install -D appium-xcuitest-driver@<línea compatible>
```

Cada driver declara en `peerDependencies` qué servidor acepta, y su última versión puede exigir un servidor que aún es beta: entonces npm se niega con `ERESOLVE`, y forzarlo con `--force` o `--legacy-peer-deps` deja una combinación que nadie probó. La línea compatible es la versión mayor más reciente cuyo `peerDependencies.appium` acepta el servidor instalado, y se consulta, no se recuerda:

```bash
npm view appium version
npm view appium-uiautomator2-driver@<mayor> peerDependencies.appium
```

`npx appium driver list --installed` confirma después qué drivers ve el servidor.

### Ejemplo mínimo con WebdriverIO

Es texto de este documento, no un archivo del repositorio; cada `<…>` lo declara el proyecto. El servicio arranca el servidor de Appium del proyecto antes de las pruebas y lo detiene al terminar, así que no hay un servidor que lanzar aparte.

```js
// wdio.conf.js
const android = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:avd': '<nombre del emulador>',
  'appium:app': '<ruta del paquete de la aplicación>',
};
const ios = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:udid': '<identificador del simulador>',
  'appium:app': '<ruta del paquete de la aplicación>',
};

export const config = {
  runner: 'local',
  specs: ['<carpeta de las pruebas>/**/*.spec.js'],
  // Un solo dispositivo es estado compartido: una sesión a la vez (lección (c)).
  maxInstances: 1,
  port: 4723,
  // El servidor escucha solo en este equipo.
  services: [['appium', { args: { address: '127.0.0.1' }, logPath: '<carpeta de registros>' }]],
  capabilities: [process.env.<variable de plataforma> === 'ios' ? ios : android],
  framework: 'mocha',
  // El primer arranque en iOS compila el agente de pruebas en el simulador y tarda minutos.
  mochaOpts: { timeout: 300000 },
};
```

```js
// <carpeta de las pruebas>/pantalla.spec.js
import { $, expect } from '@wdio/globals';

describe('la pantalla inicial', () => {
  it('muestra su título', async () => {
    // El selector ~ busca por identificador de accesibilidad, que vale en las dos plataformas.
    await expect($('~<identificador de accesibilidad>')).toBeDisplayed();
  });
});
```

Se lanza con `npx wdio run wdio.conf.js`, que el proyecto publica como script. Los datos que la aplicación guarda en el dispositivo son estado compartido entre pruebas y entre corridas: cada prueba deja la aplicación como la encontró o la reinstala, y el proyecto declara qué supone del dispositivo (lecciones (a) y (c)).

### Lo comprobado y sus límites

Comprobado con esta plantilla en macOS, con un simulador de iOS y un emulador de Android, y un proyecto de prueba que no forma parte del repositorio:

- El ejemplo abre la sesión y lee la pantalla en las dos plataformas con las versiones que npm resolvió ese día; ninguna versión se fija aquí.
- En Android, la primera sesión que deja a Appium arrancar el emulador en frío agotó dos veces sus plazos (el arranque del emulador y la instalación del servidor del driver, que el propio error nombra como `uiautomator2ServerInstallTimeout`) y pasó al tercer intento. Arrancar el emulador antes de la corrida, con el [lanzador de dispositivos móviles](90-agent-skills.md#lanzador-de-dispositivos-móviles), o subir esos plazos en las capacidades, evita tomar por fallo de la prueba lo que es un arranque lento.
- Dentro del sandbox la corrida falla con un mensaje que apunta a otra cosa (sección «Sandbox»).
- En Windows y en Linux no está comprobado, y en dispositivos físicos tampoco.

Las sesiones del agente sobre una aplicación móvil no usan estas dependencias: las abre el servidor [`appium-mcp`](95-agent-tool-servers.md#appium-mcp), que trae sus propios drivers, y son verificación interactiva que no cuenta como cobertura automatizada.

## Sandbox

- El runner que arranca un navegador o una aplicación Electron no corre dentro del sandbox en macOS: es el [caso conocido de los navegadores](91-agent-sandbox.md#caso-conocido-navegadores-bajo-macos). El fallo (`Permission denied` antes de levantar la aplicación) parece un arranque roto y no lo es: ningún cambio en la configuración de pruebas, en los navegadores instalados ni en las cachés lo corrige.
- Las pruebas móviles tampoco corren confinadas en macOS: dentro del sandbox `simctl` no alcanza el servicio de simuladores del sistema (`CoreSimulatorService connection became invalid`), y Appium responde `Unknown device or simulator UDID` para un simulador que existe y está arrancado. En Android, dentro del sandbox `adb devices` ve como `offline` un emulador que fuera está listo, y Appium agota su plazo con `Error getting AVD with retry`. En los dos casos el mensaje apunta al dispositivo y la causa es el sandbox: ningún cambio en el dispositivo ni en las capacidades lo corrige.
- La inspección de procesos tampoco funciona confinada, según el [caso conocido de inspección de procesos](91-agent-sandbox.md#caso-conocido-inspección-de-procesos): un script que busca un servidor por nombre o por su línea de comandos concluye que no existe, mientras que `lsof` sí encuentra quién escucha en un puerto.
- La salida en Claude Code es una exención `sandbox.excludedCommands`, que un proyecto derivado escribe en `.claude/settings.local.json`, por persona, porque `.claude/settings.json` está sellado, para el comando exacto del runner del proyecto, con un espacio antes del `*` final cuando el comando admite argumentos, para no cubrir otros scripts con el mismo prefijo, y con las condiciones de forma que explica [Sandbox de agentes](91-agent-sandbox.md#claude-code). En Codex no hay exención por comando: el runner pide la escalada de su sandbox.
- Riesgo: esa exención ejecuta sin confinar el código del proyecto, es decir, sus pruebas, sus scripts y todo lo que estos invoquen, y `filesystem.denyWrite` no lo protege, así que un comando confinado puede reescribir ese código antes de que corra sin confinar. Por eso se declara solo con autorización explícita.
- La declara `start`, en el mensaje de aprobación de su paso de herramientas, cuando el proyecto adopta pruebas de extremo a extremo con navegador, con Electron o con un emulador o simulador móvil, y solo con un sí explícito; un proyecto que las adopta más tarde la añade con la misma autorización. Se registra en `.readme/91-agent-sandbox.md` de ese proyecto, que es suyo (`.scripts/template-files.mjs` lo lista como propiedad del proyecto), en su sección de exenciones del proyecto si la tiene; la plantilla no define esa sección.

## Lecciones

Cada una es un principio con su porqué y lo que declara el proyecto. `04-validation-and-testing.md` las recoge como reglas; `.docs/plan.md` solo lleva, en su línea «Extremo a extremo», la herramienta, las plataformas y la ruta de la fuente que fija el puerto, el estado compartido y las firmas de fallos intermitentes conocidos; el resto de los valores que cada lección remite al proyecto vive en esa fuente, que es el archivo de configuración del runner o un documento propio del proyecto en `.readme/` por debajo del prefijo 90.

- (a) Cada prueba crea y limpia sus propios datos. Porque una prueba que depende de lo que dejó otra falla según el orden y el paralelismo, y los datos huérfanos contaminan las corridas siguientes. El proyecto declara el estado de partida que sí puede suponerse.
- (b) La prueba que cambia estado global lo declara y no corre en paralelo con otras. Porque las demás leerían un estado que cambia bajo sus pies y fallarían sin que su código tenga fallos. La propia prueba declara en su archivo, o en la configuración del runner, que cambia estado global.
- (c) Solo hay una corrida a la vez sobre un puerto o un estado compartidos. Porque dos corridas sobre el mismo puerto se pisan el servidor y sobre el mismo estado se falsean los datos. El proyecto declara el puerto y el estado compartidos; sin ellos, la regla no aplica.
- (d) Un fallo intermitente se repite aislado antes de tratarlo como real o como conocido. Porque solo la repetición aislada distingue un defecto de un choque con otra prueba, y tratar uno como el otro oculta defectos o inventa ruido. Las firmas de los fallos intermitentes conocidos las declara el proyecto; sin firmas declaradas, ninguno cuenta como conocido.
- (e) Las aserciones negativas quitan identificadores aleatorios, números de orden y fechas antes de comparar. Porque «no contiene X» pasa por casualidad si X lleva un valor que cambia en cada corrida. El proyecto declara qué campos son aleatorios o dependen del orden y de la fecha.
- (f) La evidencia dice qué estados son reales y cuáles simulados. Porque un estado simulado que se lee como real hace pasar por cubierto lo que no se ejercitó. El proyecto declara qué simula y qué ejercita de verdad.
- (g) Una suite larga puede agotar la memoria del servidor de desarrollo o un límite de peticiones, por ejemplo el de inicios de sesión. Se mide por proyecto y se corrige en el proyecto, reutilizando sesiones o subiendo el límite del proceso, nunca relajando la prueba. Porque relajar la prueba esconde el límite en lugar de corregirlo. El proyecto declara sus límites medidos y cómo se reutilizan las sesiones.
- (h) Las cifras de un informe se copian de la salida real, quien delega las comprueba contra la salida que el informe cita y la sesión corre las comprobaciones completas una vez cuando vuelven todos los encargos. Porque una cifra recordada o resumida puede ser falsa y el informe de quien ejecutó no es evidencia de quien lo recibe (`04-validation-and-testing.md` y `14-delegation.md`).
- (i) Una acción denegada se informa y no se reintenta de otra forma. Porque un límite que se sortea deja de ser un límite y el comando denegado no llegó a ejecutarse (`04-validation-and-testing.md`).
