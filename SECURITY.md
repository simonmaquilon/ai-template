# Security and Maintenance Register

> Template: replace the bracketed content and keep this file as an auditable register for the entire life of the application.

This register centralizes versions, components, dependencies, bugs, vulnerabilities, exceptions, and remediations. It does not replace manifests, lockfiles, deployed configuration, issue trackers, scanners, or an SBOM; it references them as evidence, and any difference must be reconciled.

## Control Rules

- Use stable identifiers and ISO 8601 dates (`YYYY-MM-DD`).
- Record one row per applicable version, component, bug, vulnerability, or risk; dependencies may be detailed here or in an approved generated inventory linked from here, without duplicating their rows.
- Retain resolved or retired entries to preserve history.
- Do not invent versions or statuses: obtain them from verifiable sources and link the evidence.
- Do not store secrets, personal data, or exploitable details; link a private record when necessary.
- Review the document after every relevant change and on the "Next review" date in the register status.

## Register Status

| Field | Value |
| --- | --- |
| Application | [name] |
| Current version | [version, tag, or commit] |
| Owner | [person or team] |
| Private channel | [tracker, email, or verified form] |
| Last review | [YYYY-MM-DD] |
| Next review | [YYYY-MM-DD] |
| Overall status | [not assessed, compliant, findings open, or risk accepted] |

## Application and Platform Versions

Covers the application, runtimes, frameworks, databases, platforms, external services, build, test, and deployment tooling, and operational binaries.

| Category | Component | Declared version | Resolved or deployed version | Source of truth | Support or EOL | Security status | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [runtime] | [name] | [range] | [exact version] | [file or command] | [status or date] | [status] | [YYYY-MM-DD] |

## Libraries and Dependencies

Covers every direct and transitive dependency through this table or an approved generated inventory or SBOM linked from here. Retain declared and resolved versions, role, provenance, license, maintenance status, advisories, and verification evidence; mark anything unverified as unknown. When the detail lives outside this register, document its location, scope, update method, last verification, and security status here without duplicating its rows.

| Ecosystem | Package | Role | Relationship | Declared version | Resolved version | Manifest, lockfile, or SBOM | License | Maintenance | Advisories and status | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ecosystem] | [package] | [production, development, build, or test] | [direct or transitive] | [range] | [exact version] | [path or identifier] | [SPDX or unverified] | [active, EOL, or unknown] | [no findings, not affected, affected, mitigated, or reference] | [YYYY-MM-DD] |

## Reported Bugs

Record every reported bug in the maintained product, including those with no security impact. Do not add template-maintenance findings to this skeleton intended for a derived product. Update the status and retain the row when they are resolved.

| ID | Reported | Component | Affected version | Severity | Security impact | Status | Owner | Fixed version | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [BUG-0001] | [YYYY-MM-DD] | [component] | [version] | [low, medium, high, or critical] | [none, possible, or confirmed] | [new, confirmed, in progress, blocked, resolved, or closed] | [owner] | [version or pending] | [issue, test, or commit] |

## Vulnerabilities and Advisories

| ID or CVE | Detected | Component | Affected versions | Severity | Exploitability | Status | Remediation | Target date | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [VULN-0001 or CVE] | [YYYY-MM-DD] | [component] | [versions] | [CVSS or criterion] | [unknown, unlikely, possible, or confirmed] | [open, not affected, mitigated, resolved, or risk accepted] | [action or fixed version] | [YYYY-MM-DD] | [advisory, scan, test, or private ticket] |

## Accepted Risks and Exceptions

| ID | Risk or exception | Justification | Compensating control | Approved by | Expires | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [RISK-0001] | [description] | [reason] | [mitigation] | [authorized owner] | [YYYY-MM-DD] | [active, reviewed, expired, or closed] |

## Security Verifications

| Date | Tool or command | Scope | Result | Related findings | Evidence |
| --- | --- | --- | --- | --- | --- |
| [YYYY-MM-DD] | [command or service] | [dependencies, code, container, or environment] | [passed, warnings, or failed] | [IDs or none] | [report or run] |

## Register History

| Date | Author | Change | Reference |
| --- | --- | --- | --- |
| [YYYY-MM-DD] | [person or team] | [verifiable summary] | [commit, release, bug, vulnerability, or risk] |
