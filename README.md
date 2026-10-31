# [Nombre del proyecto]

[Describe en una frase qué problema resuelve el proyecto y para quién.]

> Plantilla: reemplaza el contenido entre corchetes, elimina las secciones que no apliquen y publica únicamente comandos que hayan sido verificados.

## Estado

El estado de la entrega está en [plan.md](.docs/plan.md#estado); la versión de la aplicación y su responsable, en [security.md](.docs/security.md#status).

## Propósito

[Explica el objetivo, el alcance principal y los resultados esperados.]

## Inicio rápido

### Requisitos

- Runtime, versiones y herramientas: los fija [stack.md](.docs/stack.md).
- [Acceso, servicio externo o credenciales requeridos]

### Configuración

1. [Obtén el código fuente.]
2. [Instala las dependencias.]
3. [Crea y completa la configuración local desde la plantilla de entorno, si aplica.]
4. [Inicia el entorno local.]

No incluyas secretos ni valores reales de producción en este repositorio.

### Comandos

| Tarea | Comando | Notas |
| --- | --- | --- |
| Instalar dependencias | `[comando]` | [cuándo ejecutarlo] |
| Desarrollo local | `[comando]` | [URL o comportamiento esperado] |
| Validación | `[comando]` | [lint, tipos o formato] |
| Pruebas | `[comando]` | [alcance de la suite] |
| Compilación | `[comando]` | [artefacto generado, si aplica] |

## Arquitectura

[Resume los componentes principales, sus responsabilidades y los límites con sistemas externos.]

```text
[cliente o interfaz] -> [servicio o API] -> [datos o integraciones]
```

## Estructura del repositorio

```text
[directorio]/  # [responsabilidad]
[directorio]/  # [responsabilidad]
[directorio]/  # [responsabilidad]
```

## Documentación

- [Producto](.docs/product.md): propósito, usuarios, alcance, recorridos y reglas.
- [Diseño](.docs/design.md): tokens, experiencia y criterios visuales observables.
- [Stack](.docs/stack.md): tecnología, versiones, dependencias y herramientas de los agentes.
- [Plan](.docs/plan.md): decisiones técnicas, estado y fases entregadas.
- [Cobertura](.docs/coverage.md): cobertura verificada por requisito.
- [Bugs](.docs/bugs.md): bugs activos y cerrados.
- [Seguridad](.docs/security.md): estado de seguridad, vulnerabilidades y riesgos aceptados.
- [Pendientes](.docs/backlog.md): trabajo pendiente registrado.
- Añade aquí los enlaces a documentos de operación o arquitectura en `.readme/` cuando existan.

## Pruebas y calidad

[Resume qué niveles de prueba existen y enlaza la estrategia de validación en `.docs/plan.md`, la cobertura verificada en `.docs/coverage.md` y el detalle de ejecución en `.readme/`.]

## Despliegue y operación

[Resume los entornos y enlaza el enfoque de entrega, observabilidad y recuperación en `.docs/plan.md` y el procedimiento ejecutable en `.readme/`.]

## Contribución

[Resume el flujo de ramas, revisión y convenciones, y enlaza las comprobaciones obligatorias a la estrategia de validación en `.docs/plan.md`.]

## Licencia

No se incluye una licencia por defecto. Añade el archivo raíz `LICENSE` únicamente cuando el titular seleccione y solicite explícitamente sus términos; documenta aquí el tipo, titular y enlace cuando aplique.
