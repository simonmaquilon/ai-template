# Registro de bugs

Este archivo registra todos los bugs del producto mantenido, incluidos los que no tienen impacto de seguridad, y su estado funcional.
Reemplaza la fila `TODO` al registrar el primer bug. No añadas a este esqueleto, pensado para un producto derivado, hallazgos de mantenimiento de la plantilla.

## Reglas de registro

- Asigna a cada bug un identificador estable con el formato `BUG-0001` y registra una fila por bug.
- Usa fechas ISO 8601 (`YYYY-MM-DD`).
- Actualiza el estado cuando cambie y conserva la fila cuando el bug se resuelva o se cierre.
- No guardes secretos, datos personales ni detalles que permitan explotar el fallo; enlaza un registro privado cuando haga falta.
- Un bug con impacto de seguridad `possible` o `confirmed` abre además una entrada `VULN-…` en [SECURITY.md](SECURITY.md) que cita su `BUG-…`, y su celda de impacto de seguridad añade el identificador de esa entrada.
- Registra aquí solo el estado funcional; la explotabilidad, la remediación y el riesgo aceptado de un bug con impacto de seguridad se registran solo en [SECURITY.md](SECURITY.md).

## Bugs

Los valores permitidos de severidad son `low`, `medium`, `high` y `critical`; los de impacto de seguridad, `none`, `possible` y `confirmed`; y los de estado, `new`, `confirmed`, `in_progress`, `blocked`, `resolved` y `closed`. La versión corregida es una versión o `pending`, y la evidencia enlaza la incidencia, el test o el commit.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Responsable | Versión corregida | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
