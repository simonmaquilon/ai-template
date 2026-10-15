# Documents

Topics group the skeleton's sections for the conversation; each section's own guide line still says what it holds. "Later" sections keep their markers until delivered work fills them.

## Existing code

When the Progress state finds existing code, the repository and the user settle now what this file otherwise leaves for later or assumes absent. PLAN's Fase actual and Estado general, and README's Estado, come from the user; PLAN records a delivered phase only with its acceptance evidence from the repository. STACK's Platform Versions and Dependencies are filled now from the manifests and the generated blocks. README's Inicio rápido and Comandos take only commands the project defines that were verified in this session without installs (`03`, `17`); the rest stay later. For an existing interface, record the open decision to document it through the UI design workflow in BACKLOG.md and reference it from DESIGN, rather than waiting for a first screen.

## PRODUCT.md

English headings, Spanish content, schema marker untouched.

1. The idea: Platform (`web`, `ios`, `android`, or `adaptive`; mobile web is `web`), Users, Product Purpose, Positioning, and the project name, written in Brand Commitments (`Nombre`) and reused for the README title, DESIGN's title and `name`, and SECURITY Application.
2. Use and limits: Operating Context, Capabilities and Constraints (runtime and version limits go to STACK, other technical limits to PLAN), Scope Exclusions.
3. Who does what: Actors and Permissions, Main Journeys (trigger, steps, observable result), Rules and Invariants stated so they can be verified, Domain Terminology taken from the user's own words, including synonyms to avoid.
4. Data: Data and Integrations, including sensitive or regulated data.
5. Brand, evidence, accessibility: Brand Commitments (content voice goes to DESIGN), Evidence on Hand (real assets with their paths, and absences that must not be invented), Accessibility & Inclusion needs (the standard goes to DESIGN).
6. Principles and success: propose three to five Product Principles from the answers and get them confirmed; Success and Risks with metrics only if the user gives them.

`## Stack` stays the link to STACK. Close Open Decisions with references to the central entries in BACKLOG.md (`35`).

## DESIGN.md

English headings and frontmatter keys, Spanish content.

- First ask whether there is a user-facing surface. Without one, say so and why in Overview, write that the visual sections do not apply and why, and keep Content Voice and Accessibility if the project shows text to anyone.
- Title and frontmatter: the project name in `# Design System:` and `name`, and `description`, now; tokens (`colors`, `typography`, `rounded`, `spacing`, `components` with at most eight sub-properties each) only for brand values the user marks as binding, following the schema at the top of impeccable's `reference/document.md`. Never create the `.impeccable/design.json` sidecar.
- Ask now: Overview, Content Voice (terms from PRODUCT Domain Terminology), Accessibility (standard and conformance level, keyboard, focus, contrast, zoom), States.
- Surface Acceptance: propose rows from PRODUCT Main Journeys, or defer them to each surface's specification.
- Later: Colors, Typography, Layout, Elevation & Depth, Shapes, Components, and Do's and Don'ts, unless the user already has binding brand rules.

## STACK.md

English. Load `33` first.

- Ask now: Selected Stack (with the package manager and hosting target if decided), Runtime and Version Constraints, Approved Target Versions (record who approved and when), Dependency and license policy, UI Libraries, Validation Tooling, Observability Tooling.
- Later: Platform Versions and Dependencies, filled after installing, or now with existing code. Project Tooling changes only through the tooling step.

## PLAN.md

Spanish, decision level only: no reproduced implementation identifiers, route paths, or versions, and nothing STACK already holds; pending-item identifiers and links are allowed. Until directories exist, `Ruta o sistema propietario` names the owning area or system.

- Ask now: Objetivo; Fase actual and Estado general as they stand (`planificación, sin código` without existing code); Restricciones y decisiones técnicas; Arquitectura y propiedad; Datos, contratos e integraciones; Fases de implementación, recording unfinished phases in BACKLOG.md and only their references in PLAN, except verified phases that Existing code allows; Estrategia de validación; Entrega y operación; Riesgos y decisiones abiertas as references to BACKLOG.md (`35`).
- The line `Verificación interactiva en navegador por agente` must end as adopted (a web surface and the user agrees), `No aplica: sin superficie web`, or `TODO` with a BACKLOG.md entry (`35`), because `17` depends on it.
- Later: Última verificación and Registro de avance, which record verified work only.

## SECURITY.md and README.md

- SECURITY (English): in Register Status, Application, Owner, Private channel (a contact that is not secret), Next review (an ISO date from an agreed cadence), and Overall status `not assessed`. Everything else is later.
- README (Spanish): title, one-line pitch, Estado (`planificación` without existing code) with Responsable, and Propósito. A `LICENSE` only when the user picks the terms and the holder (`16`). Later: Versión, Inicio rápido, Comandos (verified only), Arquitectura, Estructura del repositorio, Pruebas y calidad, Despliegue y operación, Contribución.

## Not touched

TESTS.md and BUGS.md keep verified facts, historical records and references filled by later work. AGENTS.md changes only to record a deviation.

## BACKLOG.md

Spanish. Follow the entry requirements and lifecycle in `35`; populate this file only from real pending work and open decisions collected in the conversation, rather than treating it as an interview document to fill by default. PRODUCT, DESIGN, PLAN and other documents reference these entries rather than repeating pending detail.

## Reconciliation checklist

- PRODUCT `## Stack` is still only the link, and no STACK value is repeated in PRODUCT, PLAN, or SECURITY (`33`).
- The project name is identical in README, DESIGN, and SECURITY; terminology matches PRODUCT Domain Terminology across DESIGN, PLAN, and README.
- Surface Acceptance matches Main Journeys; phases cover the capabilities and respect Scope Exclusions; the browser verification line agrees with Platform.
- Each pending item or open decision is detailed once in BACKLOG.md, and the other documents only reference it (`35`).
- Languages follow `15`; headings other than the title placeholders, guide text, schema marker, and frontmatter keys are intact.
