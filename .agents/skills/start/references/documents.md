# Documents

The documents live in `.docs/`. Topics group each skeleton's sections for the conversation; each section's guide line says what it holds. Sections left for later keep their `TODO` until delivered work fills them.

## Existing code

When the Progress state finds existing code, the repository and the user settle now what this file otherwise leaves for later or assumes absent. plan.md's Fase actual and Estado verificado come from the user; plan.md records a delivered phase only with its acceptance evidence from the repository. stack.md's Platform Versions and Dependencies are filled now from the manifests and the generated blocks. README's Inicio rápido and Comandos take only commands the project defines that were verified in this session without installs (`AGENTS.md`, `04`); the rest stay later. For an existing interface, record the open decision to document it through the UI design workflow in backlog.md and reference it from design.md, rather than waiting for a first screen.

## product.md

Spanish headings and content.

1. The idea: Propósito, Plataforma (`web`, `ios`, `android`, or `adaptive`; mobile web is `web`), Usuarios y contexto, and the project name, written in Marca, principios y accesibilidad and reused for the README title, design.md's title and `name`, and security.md's Application.
2. Limits: Alcance; runtime and version limits go to stack.md and other technical limits to plan.md.
3. Who does what: Actores y permisos, Recorridos principales (trigger, steps, observable result), Reglas e invariantes stated so they can be verified, and Terminología taken from the user's own words, with the synonyms to avoid.
4. Data: Datos e integraciones, including sensitive or regulated data.
5. Brand, principles, accessibility: brand commitments (content voice goes to design.md), three to five principles proposed from the answers and confirmed, and accessibility needs (the standard goes to design.md).
6. Success: Éxito y riesgos, with metrics only if the user gives them.

Open product decisions go to backlog.md (`11`) and are referenced by identifier.

## design.md

English headings and frontmatter keys, Spanish content.

- First ask whether there is a user-facing surface. Without one, say so and why in Overview, write that the visual sections do not apply and why, and keep Content Voice and Accessibility if the project shows text to anyone.
- Title and frontmatter: the project name in `# Design System:` and `name`, and `description`, now; tokens (`colors`, `typography`, `rounded`, `spacing`, `components` with at most eight sub-properties each) only for brand values the user marks as binding.
- Ask now: Overview, Content Voice (terms from product.md's Terminología), Accessibility (standard and level, keyboard, focus, contrast, zoom), and States.
- Surface Acceptance: propose rows from product.md's Recorridos principales, or leave it for later until a surface's specification records its rows.
- Later: Colors, Typography, Layout, Elevation & Depth, Shapes, Components, and Do's and Don'ts, unless the user already has binding brand rules.

## stack.md

English. Load `06` first.

- Ask now: Selected Stack (with the package manager and hosting target if decided), Runtime and Version Constraints, Approved Target Versions (who approved and when), the dependency and license policy, and Libraries and Tools.
- Later: Platform Versions and Dependencies, filled after installing, or now with existing code. Project Tooling changes only through the tooling step.

## plan.md

Spanish, decision level only: no reproduced identifiers, routes, or versions, and nothing stack.md already holds; pending-item identifiers and links are allowed. Until directories exist, Propietario names the owning area or system.

- Ask now: Estado (Objetivo, plus Fase actual and Estado verificado as they stand: `planificación, sin código` without existing code), Decisiones técnicas, Arquitectura y propiedad, Datos e integraciones, Validación, Entrega y operación, and Riesgos técnicos aceptados. Unfinished phases go to backlog.md (`11`); Fases entregadas records verified phases only, which Existing code may allow now.
- The line `Verificación en navegador por agente` must end as adopted (a web surface and the user agrees), `No aplica` with the reason, or `TODO` with a backlog.md entry (`11`), because `07` depends on it.

## security.md and README.md

- security.md (English): in Status, Application, Owner, Private reporting channel (a contact that is not secret), Next review (an ISO date from an agreed cadence), and Overall status `not assessed`. Everything else is later.
- README (Spanish): title, one-line pitch, and Propósito; Estado only links plan.md and security.md. A `LICENSE` only when the user picks the terms and the holder (`10`). Later: Inicio rápido, Comandos (verified only), Arquitectura, Estructura del repositorio, Pruebas y calidad, Despliegue y operación, Contribución.

## Not touched

coverage.md and bugs.md are registers filled by later work. AGENTS.md changes only to record a deviation.

## backlog.md

Spanish. It starts empty: follow `11`, and add entries only for real pending work and open decisions collected in the conversation. The other documents reference these entries instead of repeating their detail.

## Reconciliation checklist

- No stack.md value is repeated in product.md, plan.md, or security.md (`06`).
- The project name is identical in README, design.md, and security.md; terminology matches product.md's Terminología across design.md, plan.md, and README.
- Surface Acceptance matches Recorridos principales; phases cover Alcance and respect its exclusions; the browser verification line agrees with Plataforma.
- Each pending item or open decision is detailed once in backlog.md, and the other documents only reference it (`11`).
- Languages follow `AGENTS.md`; design.md's headings and frontmatter keys are intact.
