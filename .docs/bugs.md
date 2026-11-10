# Bugs

Los bugs del comportamiento ya entregado, activos y cerrados. Un fallo de algo aún no entregado va en su entrada de [backlog.md](backlog.md). Al registrar el primer bug, elimina la fila `TODO` de Activos, aunque el bug vaya a Cerrados. Cada fila va en la sección que corresponde a su estado; una tabla sin filas conserva su encabezado y delimitador.

- Identificador estable `BUG-0001`, nunca reutilizado; una fila por bug, que se mueve al cerrar sin perder el identificador ni la ruta del test.
- Fechas `YYYY-MM-DD`. Sin secretos, datos personales ni detalles explotables: enlaza un registro privado si hace falta.
- Un bug con impacto de seguridad `possible` o `confirmed` abre también una entrada `VULN-…` en [security.md](security.md) que lo cita, y la añade en su celda de impacto.
- La evidencia contiene solo una frase de causa, una frase de corrección, la ruta del test de regresión y el commit o versión de la corrección; el test cita a su vez el `BUG-…`.
- Las medidas, la reproducción y el diagnóstico extenso van en el commit, el test o un registro privado enlazado, nunca en la fila.
- La evidencia antigua de un bug cerrado puede compactarse al volver a editar su fila; moverla durante una migración no obliga a compactarla.

Severidad: `low`, `medium`, `high`, `critical`. Impacto de seguridad: `none`, `possible`, `confirmed`. Corregido en: versión o commit; `pending` mientras siga activo y `none` si se cerró sin corrección. No inventes evidencia pendiente ni de una corrección inexistente.

## Activos

Estados: `new`, `confirmed`, `in_progress`, `blocked`.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Corregido en | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Cerrados

Estados: `resolved`, `closed`.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Corregido en | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
