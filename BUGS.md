# Registro de bugs

Este archivo conserva los registros históricos verificados de bugs y referencias a los bugs activos, cuyo detalle y estado viven en [BACKLOG.md](BACKLOG.md).
Reemplaza la fila `TODO` al incorporar el primer registro histórico verificado. No añadas a este esqueleto, pensado para un producto derivado, hallazgos de mantenimiento de la plantilla.

## Reglas de registro

- Asigna a cada bug un identificador estable con el formato `BUG-0001` y registra una fila por bug.
- Usa fechas ISO 8601 (`YYYY-MM-DD`).
- Actualiza el detalle y estado del bug activo en [BACKLOG.md](BACKLOG.md); conserva los registros históricos verificados y sus identificadores.
- No guardes secretos, datos personales ni detalles que permitan explotar el fallo; enlaza un registro privado cuando haga falta.
- Un bug activo con impacto de seguridad `possible` o `confirmed` conserva sus identificadores `BUG-…` y `VULN-…` en una entrada central; [SECURITY.md](SECURITY.md) y este documento la referencian.
- El detalle funcional y de seguridad pendiente permanece en la entrada central; la evidencia histórica y los hechos verificados de seguridad permanecen en [SECURITY.md](SECURITY.md).

## Bugs activos

[BACKLOG.md](BACKLOG.md) contiene el detalle de los bugs activos. Añade aquí solo sus identificadores y enlaces.

## Bugs

Los valores permitidos de severidad son `low`, `medium`, `high` y `critical`; los de impacto de seguridad, `none`, `possible` y `confirmed`; y los de estado, `new`, `confirmed`, `in_progress`, `blocked`, `resolved` y `closed`. La versión corregida es una versión o `pending`, y la evidencia enlaza la incidencia, el test o el commit.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Responsable | Versión corregida | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
