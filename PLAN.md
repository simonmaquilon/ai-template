# Plan

Este archivo traduce las decisiones autoritativas de producto y diseño en una secuencia de entrega ejecutable y verificable.
`PRODUCT.md` define el comportamiento del producto, `DESIGN.md` define la experiencia observable y `STACK.md` el stack tecnológico; este plan no debe contradecirlos. Reemplaza cada `TODO` antes de considerar decidido ese elemento.

## Estado de la entrega

- Objetivo: TODO
- Fase actual: TODO
- Estado general: TODO
- Última verificación: TODO

El estado debe describir trabajo verificado en el repositorio, no avance previsto o supuesto.

## Restricciones y decisiones técnicas

- Decisiones técnicas derivadas del stack: TODO — El stack, el runtime con sus restricciones de versión y la política de dependencias y licencias están en [STACK.md](STACK.md); si su sección `Selected Stack` no existe, manda el stack instalado. No los repitas aquí.
- Entornos objetivo y límites de despliegue: TODO
- Decisiones excluidas explícitamente de esta entrega: TODO

## Arquitectura y propiedad

| Área o componente | Responsabilidad | Ruta o sistema propietario | Dependencias permitidas |
| --- | --- | --- | --- |
| TODO | TODO | TODO | TODO |

- Dirección de dependencias y reglas de límites: TODO
- Contratos compartidos y límites de fuentes generadas: TODO
- Propiedad externa o coordinación entre repositorios: TODO

## Datos, contratos e integraciones

- Fuentes de verdad y autoridad de escritura: TODO
- Estrategia técnica de contratos, versionado y compatibilidad: TODO
- Persistencia, migraciones, reversión y recuperación: TODO
- Sistemas externos, comportamiento ante fallos e idempotencia: TODO
- Datos sensibles, control de acceso, retención y auditoría: TODO

## Fases de implementación

Registra en la tabla solo las fases entregadas, con su evidencia de aceptación. Las fases pendientes se detallan en [BACKLOG.md](BACKLOG.md); enlázalas debajo de la tabla.

| Fase | Resultado | Alcance propietario | Dependencias | Evidencia de aceptación |
| --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO |

## Estrategia de validación

Aquí se decide qué se valida y en qué nivel; las herramientas de cada nivel están en Validation Tooling de [STACK.md](STACK.md).

- Análisis estático, formato y comprobaciones de tipos: TODO
- Pruebas unitarias: TODO
- Pruebas de integración y contratos: TODO
- Pruebas de extremo a extremo o recorridos de usuario: TODO
- Verificación interactiva en navegador por agente: TODO
- Comprobaciones de seguridad, privacidad y autorización: TODO
- Comprobaciones de accesibilidad, compatibilidad y rendimiento: TODO
- Comprobaciones de compilación, migración, despliegue y reversión: TODO

La cobertura observada y las verificaciones completadas se registran en [TESTS.md](TESTS.md); el detalle de trabajo de pruebas pendiente está en [BACKLOG.md](BACKLOG.md).

## Entrega y operación

- Configuración y provisión de secretos: TODO
- Enfoque de publicación o despliegue: TODO
- Observabilidad y comprobaciones de salud: TODO — Las herramientas están en Observability Tooling de [STACK.md](STACK.md).
- Enfoque de reversión y recuperación: TODO
- Documentación que debe cambiar con la entrega: TODO

## Riesgos y decisiones abiertas

Los riesgos que requieren trabajo y las decisiones técnicas o de entrega pendientes se detallan en [BACKLOG.md](BACKLOG.md). Aquí se conservan únicamente sus referencias.

## Registro de avance

Registra únicamente hitos duraderos que hayan sido verificados; el historial de investigación pertenece a incidencias, commits o notas de tareas, no a este archivo.

| Fecha | Fase | Resultado verificado | Evidencia |
| --- | --- | --- | --- |
| TODO | TODO | TODO | TODO |
