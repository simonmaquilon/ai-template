# Security and Maintenance Register

> Template: replace the bracketed content and keep this file as an auditable register for the entire life of the application.

This register centralizes versions, components, dependencies, vulnerabilities, exceptions, and remediations. Functional defects of the maintained product are recorded in [BUGS.md](BUGS.md); this register holds only their security aspect. It does not replace manifests, lockfiles, deployed configuration, issue trackers, scanners, or an SBOM; it references them as evidence, and any difference must be reconciled.

## Control Rules

- Use stable identifiers and ISO 8601 dates (`YYYY-MM-DD`).
- Record one row per applicable version, component, vulnerability, or risk; dependencies may be detailed here or in an approved generated inventory linked from here, without duplicating their rows.
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

Covers the application, runtimes, databases, platforms, and external services; frameworks, libraries, CLI tools, and binaries, including build, test, and deployment tooling, belong to Libraries and Dependencies. Anything only template-owned agent tooling or automation requires is recorded in the `.readme/` document that configures it, not here.

| Category | Component | Declared version | Resolved or deployed version | Source of truth | Support or EOL | Security status | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [runtime] | [name] | [range] | [exact version] | [file or command] | [status or date] | [status] | [YYYY-MM-DD] |

## Libraries and Dependencies

Covers every direct and transitive dependency, including frameworks, CLI tools, and binaries, except those only template-owned agent tooling or automation requires, through this table or an approved generated inventory or SBOM linked from here. Retain declared and resolved versions, role, provenance, license, maintenance status, advisories, and verification evidence; mark anything unverified as unknown. When the detail lives outside this register, document its location, scope, update method, last verification, and security status here without duplicating its rows.

| Ecosystem | Package | Role | Relationship | Declared version | Resolved version | Manifest, lockfile, or SBOM | License | Maintenance | Advisories and status | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ecosystem] | [package] | [production, development, build, or test] | [direct or transitive] | [range] | [exact version] | [path or identifier] | [SPDX or unverified] | [active, EOL, or unknown] | [no findings, not affected, affected, mitigated, or reference] | [YYYY-MM-DD] |

## Vulnerabilities and Advisories

A bug in the maintained product with possible or confirmed security impact has an entry here that cites its `BUG-…` from [BUGS.md](BUGS.md). Record its exploitability, remediation, and accepted risk only in this register; its functional status and fixed version stay in [BUGS.md](BUGS.md).

| ID or CVE | Related bug | Detected | Component | Affected versions | Severity | Exploitability | Status | Remediation | Target date | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [VULN-0001 or CVE] | [BUG-0001 or none] | [YYYY-MM-DD] | [component] | [versions] | [CVSS or criterion] | [unknown, unlikely, possible, or confirmed] | [open, not affected, mitigated, resolved, or risk accepted] | [action or fixed version] | [YYYY-MM-DD] | [advisory, scan, test, or private ticket] |

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
| [YYYY-MM-DD] | [person or team] | [verifiable summary] | [commit, release, vulnerability, or risk] |
