# Security and Maintenance Register

> Template: replace the bracketed content and keep this file as an auditable register for the entire life of the application.

This register centralizes the security state of every component, vulnerabilities, exceptions, and remediations. The components and their versions live in [STACK.md](STACK.md); this register cites their rows there without copying their versions. Functional defects of the maintained product are recorded in [BUGS.md](BUGS.md); this register holds only their security aspect. It does not replace manifests, lockfiles, deployed configuration, issue trackers, scanners, or an SBOM; it references them as evidence, and any difference must be reconciled.

## Control Rules

- Use stable identifiers and ISO 8601 dates (`YYYY-MM-DD`).
- Record one row per applicable component, vulnerability, or risk; identify each component by its row in [STACK.md](STACK.md) instead of duplicating its version.
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

## Component Security Status

Covers every runtime, database, platform, external service, and dependency that Platform Versions and Dependencies of [STACK.md](STACK.md) list, or their approved generated inventory or SBOM; the tooling under its Template Tooling and Project Tooling is outside this register. Mark anything unverified as unknown.

| Component | STACK.md section | Security status | Advisories | Verified |
| --- | --- | --- | --- | --- |
| [name] | [Platform Versions or Dependencies] | [no findings, not affected, affected, mitigated, or reference] | [advisory IDs or none] | [YYYY-MM-DD] |

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
