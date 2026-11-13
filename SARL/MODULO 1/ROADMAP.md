# Development Roadmap & Risk Management (PLAN)

## Módulo SARL: Submódulo Carga de PUC (MVP)

**Document Status:** Draft
**Methodology:** Agile / Scrum (Sprints de 1 semana)
**Target:** MVP Carga Síncrona de PUC y Cálculo IRL

### 1. Hitos del Proyecto (Milestones)

* **Hito 1 (M1):** Infraestructura Base y Modelado de Datos desplegados.
* **Hito 2 (M2):** Motor de Validación y Cálculo Matemático (Core) superando el 100% de los Unit Tests.
* **Hito 3 (M3):** Integración Frontend-Backend con Strict Rejection visual.
* **Hito 4 (M4):** Despliegue en VPS (UAT/Producción) y pruebas E2E con archivos contables reales.

### 2. Sprints de Desarrollo

#### Sprint 1: Foundation & Data Pipeline (Backend)
**Objetivo:** Preparar el terreno de datos y el motor de recepción de archivos.
* **Tareas Clave:**
  * Scripting y migración de base de datos PostgreSQL (`sarl_evaluation_periods`, `sarl_puc_batches` con restricción única por periodo, `sarl_puc_records`, `sarl_irl_band_flows`).
  * Configuración del servidor Node.js/Express con arquitectura en capas (`controllers`, `services`, `models`, `repositories`).
  * Implementación de middleware `multer` (Límite 20MB, validación de Mime-Types).
  * Desarrollo del parser CSV (conversión de *stream* a *buffer* JSON), validación estructural con `Zod` y sanitización anti-CSV Injection.
  * Control de no duplicidad de periodo (`HTTP 409 Conflict`) y endpoint de eliminación de lote mensual (`DELETE /api/v1/sarl/puc/:batchId`).
* **Entregable:** Endpoints base que validan unicidad del mes, reciben el archivo, lo parsean o permiten eliminar un mes cargado previamente.

#### Sprint 2: Motor Matemático y Reglas de Negocio (Backend)
**Objetivo:** Codificar y probar exhaustivamente el `IRLCalculatorService`.
* **Tareas Clave:**
  * Lógica de Gastos Administrativos: Query histórico (11 meses atrás) + mes actual / 12.
  * Lógica de Créditos no Desembolsados (Cta. 911500): División algorítmica (50% Banda 1, 50% Banda 2).
  * Lógica de Fondos Sociales: Prorrateo lineal (Abril a Diciembre).
  * Implementación del patrón de transacción atómica (ROLLBACK en caso de fallo).
* **Entregable:** Endpoint finalizado con respuestas de *Strict Rejection* formateadas y cálculo matemático preciso insertado en `sarl_irl_results`.

#### Sprint 3: Interfaz de Usuario e Integración (Frontend Angular)
**Objetivo:** Construir la experiencia "Minimalista y Guiada".
* **Tareas Clave:**
  * Desarrollo del componente *Dropzone* (Drag and Drop) con validación de extensión local (.csv).
  * Implementación del estado "Cargando..." (Loader síncrono que bloquea la UI).
  * Desarrollo de la vista de *Error Log* (Tabla de rechazo estricto).
  * Desarrollo de la vista de Éxito (Dashboard resumen de las 4 bandas).
* **Entregable:** Frontend Angular integrado con el API, manejando correctamente códigos HTTP 200 (Éxito) y 422 (Fallo de validación).

#### Sprint 4: Infraestructura y QA (DevOps & Testing)
**Objetivo:** Asegurar la calidad financiera y desplegar en VPS.
* **Tareas Clave:**
  * Pruebas Unitarias al motor matemático usando la librería `decimal.js` para evitar pérdida de precisión.
  * Configuración del VPS: Nginx como Reverse Proxy, PM2 para gestión de procesos de Node.js, y afinamiento de PostgreSQL.
  * Pruebas End-to-End (E2E) simulando la subida de un PUC real de la cooperativa.
* **Entregable:** Submódulo en ambiente productivo o pre-productivo (UAT) listo para uso manual del analista.

### 3. Gestión de Riesgos (Risk Management)

| Riesgo Detectado | Nivel de Impacto | Estrategia de Mitigación (Plan de Acción) |
| :--- | :--- | :--- |
| **Precisión de Punto Flotante** (Node.js maneja números como IEEE 754, lo que puede causar errores en cálculos financieros como `0.1 + 0.2 = 0.30000000000000004`). | Alto | **Arquitectónica:** Prohibido usar `Number` nativo de JS para el motor matemático. Obligatorio el uso de librerías de precisión arbitraria como `decimal.js` o `bignumber.js`. En BD usar tipo `DECIMAL(19,4)`. |
| **Agotamiento de Memoria (OOM)** por archivos CSV inusualmente grandes. | Medio | **Infraestructura:** Bloqueo estricto a nivel de Nginx (`client_max_body_size 20M`) y Multer en Node.js. Si se prevé escalar en el futuro, migrar de Buffer sincrónico a *Event Streams* asíncronos. |
| **Datos Incompletos en Histórico** (Al calcular el promedio de 12 meses para gastos administrativos, puede que la BD no tenga los 11 meses anteriores). | Alto | **Negocio:** Definir una regla de contingencia. Ej. Si hay menos de 12 meses, calcular el promedio con el divisor de la cantidad de meses existentes (`meses_disponibles`). |
| **Errores de Formato de Origen** (El sistema contable exporta el CSV con comas en los miles o codificación no-UTF8). | Alto | **Operativa:** Estandarizar la plantilla CSV esperada. El parser en Node.js debe estar configurado explícitamente para UTF-8 y realizar un *regex replace* en las columnas de saldos para remover puntuaciones antes del casteo numérico. |