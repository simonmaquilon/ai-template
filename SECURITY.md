# Registro de seguridad y mantenimiento

> Plantilla: reemplaza el contenido entre corchetes y conserva este archivo como registro auditable durante toda la vida de la aplicación.

Este registro centraliza versiones, componentes, dependencias, bugs, vulnerabilidades, excepciones y remediaciones. No sustituye manifiestos, lockfiles, configuración desplegada, gestores de incidencias, escáneres ni un SBOM; los referencia como evidencia y cualquier diferencia debe reconciliarse.

## Reglas de control

- Usa identificadores estables y fechas ISO 8601 (`YYYY-MM-DD`).
- Registra una fila por versión, componente, dependencia, bug, vulnerabilidad o riesgo aplicable.
- Conserva las entradas resueltas o retiradas para mantener el historial.
- No inventes versiones ni estados: obténlos de fuentes verificables y enlaza la evidencia.
- No almacenes secretos, datos personales ni detalles explotables; enlaza un registro privado cuando sea necesario.
- Revisa el documento después de cada cambio relevante y según la cadencia definida abajo.

## Estado del registro

| Campo | Valor |
| --- | --- |
| Aplicación | [nombre] |
| Versión actual | [versión, tag o commit] |
| Responsable | [persona o equipo] |
| Canal privado | [gestor, correo o formulario verificado] |
| Última revisión | [YYYY-MM-DD] |
| Próxima revisión | [YYYY-MM-DD] |
| Estado general | [sin evaluar, conforme, con hallazgos o riesgo aceptado] |

## Versiones de aplicación y plataforma

Incluye la aplicación, runtimes, frameworks, bases de datos, plataformas, servicios externos, herramientas de compilación, pruebas y despliegue, y binarios operativos.

| Categoría | Componente | Versión declarada | Versión resuelta o desplegada | Fuente de verdad | Soporte o EOL | Estado de seguridad | Verificado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [runtime] | [nombre] | [rango] | [versión exacta] | [archivo o comando] | [estado o fecha] | [estado] | [YYYY-MM-DD] |

## Librerías y dependencias

Incluye todas las dependencias directas y transitivas. Un SBOM aprobado puede generar o verificar este inventario, pero cada entrada debe conservar procedencia y versión resuelta.

| Ecosistema | Paquete | Rol | Relación | Versión declarada | Versión resuelta | Manifiesto, lockfile o SBOM | Licencia | Mantenimiento | Avisos y estado | Verificado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ecosistema] | [paquete] | [producción, desarrollo, compilación o prueba] | [directa o transitiva] | [rango] | [versión exacta] | [ruta o identificador] | [SPDX o sin verificar] | [activo, EOL o desconocido] | [sin hallazgos, afectado, mitigado o referencia] | [YYYY-MM-DD] |

## Bugs reportados

Registra todos los bugs reportados, incluso los que no tengan impacto de seguridad. Actualiza su estado y conserva la fila al resolverlos.

| ID | Reportado | Componente | Versión afectada | Severidad | Impacto de seguridad | Estado | Responsable | Versión corregida | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [BUG-0001] | [YYYY-MM-DD] | [componente] | [versión] | [baja, media, alta o crítica] | [ninguno, posible o confirmado] | [nuevo, confirmado, en curso, bloqueado, resuelto o cerrado] | [responsable] | [versión o pendiente] | [issue, prueba o commit] |

## Vulnerabilidades y avisos

| ID o CVE | Detectada | Componente | Versiones afectadas | Severidad | Explotabilidad | Estado | Remediación | Fecha objetivo | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [VULN-0001 o CVE] | [YYYY-MM-DD] | [componente] | [versiones] | [CVSS o criterio] | [desconocida, improbable, posible o confirmada] | [abierta, mitigada, resuelta o riesgo aceptado] | [acción o versión corregida] | [YYYY-MM-DD] | [aviso, escaneo, prueba o ticket privado] |

## Riesgos y excepciones aceptadas

| ID | Riesgo o excepción | Justificación | Control compensatorio | Aprobado por | Vence | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| [RISK-0001] | [descripción] | [motivo] | [mitigación] | [responsable autorizado] | [YYYY-MM-DD] | [activo, revisado, vencido o cerrado] |

## Verificaciones de seguridad

| Fecha | Herramienta o comando | Alcance | Resultado | Hallazgos relacionados | Evidencia |
| --- | --- | --- | --- | --- | --- |
| [YYYY-MM-DD] | [comando o servicio] | [dependencias, código, contenedor o entorno] | [aprobado, advertencias o falló] | [IDs o ninguno] | [reporte o ejecución] |

## Historial del registro

| Fecha | Autor | Cambio | Referencia |
| --- | --- | --- | --- |
| [YYYY-MM-DD] | [persona o equipo] | [resumen verificable] | [commit, release, bug, vulnerabilidad o riesgo] |
