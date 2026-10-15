# Registro de cobertura de pruebas

Este archivo registra la cobertura verificada de cada requisito o recorrido del producto y describe solo el estado actual, sin historial.
No enumera tests individuales: las suites y el runner son la fuente autoritativa. La estrategia de validación está en [PLAN.md](PLAN.md), el trabajo pendiente en [BACKLOG.md](BACKLOG.md) y los bugs en [BUGS.md](BUGS.md). Reemplaza cada `TODO` antes de considerar verificado ese elemento.

## Estado

Registra la última ejecución completa verificada de las suites.

- Fecha: TODO
- Comando: TODO
- Resultado: TODO
- Evidencia: TODO
- Umbral de cobertura: TODO — Cita el archivo de configuración que lo fija, sin copiar su valor.

## Matriz de trazabilidad

Enlaza cada requisito o recorrido con su definición en [PRODUCT.md](PRODUCT.md) o [DESIGN.md](DESIGN.md). Los niveles son unitaria, integración y extremo a extremo; los estados permitidos son `covered`, `partial` y `gap`.

| Requisito o recorrido | Nivel | Suite o ruta | Estado | Evidencia | Fecha de verificación |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

## Huecos y verificaciones manuales o por agente

El detalle de pruebas y verificaciones pendientes vive en [BACKLOG.md](BACKLOG.md); enlaza aquí sus referencias.

### Verificaciones completadas

Registra cada verificación manual o por agente completada que cubre lo que no tiene prueba automática.

| Sin prueba automática | Motivo | Verificación manual o por agente, evidencia y fecha |
| --- | --- | --- |
| TODO | TODO | TODO |

## Tests inestables o en cuarentena

El detalle de trabajo pendiente sobre estabilidad o cuarentena vive en [BACKLOG.md](BACKLOG.md). Aquí se conservan sus referencias.
