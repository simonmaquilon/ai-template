# Documents

Topics group the skeleton's sections for the conversation; each section's own guide line still says what it holds. "Later" sections keep their markers until delivered work fills them.

## PRODUCT.md

English headings, Spanish content, schema marker untouched.

1. The idea: Platform (`web`, `ios`, `android`, or `adaptive`; mobile web is `web`), Users, Product Purpose, Positioning, and the project name, written in Brand Commitments (`Nombre`) and reused for the README title, DESIGN's title and `name`, and SECURITY Application.
2. Use and limits: Operating Context, Capabilities and Constraints (runtime and version limits go to STACK, other technical limits to PLAN), Scope Exclusions.
3. Who does what: Actors and Permissions, Main Journeys (trigger, steps, observable result), Rules and Invariants stated so they can be verified, Domain Terminology taken from the user's own words, including synonyms to avoid.
4. Data: Data and Integrations, including sensitive or regulated data.
5. Brand, evidence, accessibility: Brand Commitments (content voice goes to DESIGN), Evidence on Hand (real assets with their paths, and absences that must not be invented), Accessibility & Inclusion needs (the standard goes to DESIGN).
6. Principles and success: propose three to five Product Principles from the answers and get them confirmed; Success and Risks with metrics only if the user gives them.

`## Stack` stays the link to STACK. Close with Open Decisions.

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
- Later: Platform Versions and Dependencies, filled after installing. Project Tooling changes only through the tooling step.

## PLAN.md

Spanish, decision level only: no identifiers, route paths, or versions, and nothing STACK already holds. Until directories exist, `Ruta o sistema propietario` names the owning area or system.

- Ask now: Objetivo; Fase actual and Estado general as they stand (`planificación, sin código`); Restricciones y decisiones técnicas; Arquitectura y propiedad; Datos, contratos e integraciones; Fases de implementación, all `pending`; Estrategia de validación; Entrega y operación; Riesgos y decisiones abiertas.
- The line `Verificación interactiva en navegador por agente` must end as adopted (a web surface and the user agrees), `No aplica: sin superficie web`, or `TODO` with a register entry, because `17` depends on it.
- Later: Última verificación and Registro de avance, which record verified work only.

## SECURITY.md and README.md

- SECURITY (English): in Register Status, Application, Owner, Private channel (a contact that is not secret), Next review (an ISO date from an agreed cadence), and Overall status `not assessed`. Everything else is later.
- README (Spanish): title, one-line pitch, Estado (`planificación`) with Responsable, and Propósito. A `LICENSE` only when the user picks the terms and the holder (`16`). Later: Versión, Inicio rápido, Comandos (verified only), Arquitectura, Estructura del repositorio, Pruebas y calidad, Despliegue y operación, Contribución.

## Not touched

TESTS.md and BUGS.md are registers filled by later work. AGENTS.md changes only to record a deviation.

## Reconciliation checklist

- PRODUCT `## Stack` is still only the link, and no STACK value is repeated in PRODUCT, PLAN, or SECURITY (`33`).
- The project name is identical in README, DESIGN, and SECURITY; terminology matches PRODUCT Domain Terminology across DESIGN, PLAN, and README.
- Surface Acceptance matches Main Journeys; phases cover the capabilities and respect Scope Exclusions; the browser verification line agrees with Platform.
- Each open decision lives in exactly one register.
- Languages follow `15`; headings other than the title placeholders, guide text, schema marker, and frontmatter keys are intact.
