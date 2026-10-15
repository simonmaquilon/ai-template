# Registro de bugs

Este archivo registra todos los bugs del comportamiento entregado del producto mantenido, activos y cerrados, incluidos los que no tienen impacto de seguridad, con su estado funcional; un fallo de trabajo aún no entregado se detalla en su entrada de [BACKLOG.md](BACKLOG.md).
Reemplaza la fila `TODO` al registrar el primer bug. No añadas a este esqueleto, pensado para un producto derivado, hallazgos de mantenimiento de la plantilla.

## Reglas de registro

- Asigna a cada bug un identificador estable con el formato `BUG-0001`, sin reutilizarlo, y registra una fila por bug.
- Usa fechas ISO 8601 (`YYYY-MM-DD`).
- Actualiza el estado cuando cambie y conserva la fila cuando el bug se resuelva o se cierre.
- No guardes secretos, datos personales ni detalles que permitan explotar el fallo; enlaza un registro privado cuando haga falta.
- Un bug con impacto de seguridad `possible` o `confirmed` abre además una entrada `VULN-…` en [SECURITY.md](SECURITY.md) que cita su `BUG-…`, y su celda de impacto de seguridad añade el identificador de esa entrada.

## Bugs

Los valores permitidos de severidad son `low`, `medium`, `high` y `critical`; los de impacto de seguridad, `none`, `possible` y `confirmed`, seguidos de su `VULN-…` cuando corresponda; y los de estado, `new`, `confirmed`, `in_progress`, `blocked`, `resolved` y `closed`. La versión corregida es una versión o, si el proyecto no declara versiones, la referencia verificable de la corrección, como una rama o un commit; es `pending` mientras el bug siga activo y `none` si se cerró sin corrección. La evidencia enlaza la incidencia, el test o el commit.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Responsable | Versión corregida | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
