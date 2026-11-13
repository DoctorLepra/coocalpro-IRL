# Technical Requirements Document (TRD)

## Módulo SARL: Submódulo Carga de PUC (MVP)

**Document Status:** Draft
**Architectural Pattern:** Reasoning-before-Action (R-b-A)
**Tech Stack:** Node.js (Backend), Angular (Frontend), PostgreSQL (Database), VPS (Infra)

### 1. Arquitectura del Sistema y Flujo de Datos

Dado el requerimiento de procesamiento **síncrono**, el backend en Node.js implementará un flujo de lectura de *streams* que no bloquee el *Event Loop*, pero que mantenga la conexión HTTP abierta hasta que se complete la transacción en la base de datos o se dispare el *Strict Rejection*.

1. **Capa de Presentación (Angular):** Envía el archivo `.csv` usando `FormData` vía solicitud `POST`. Intercepta la respuesta HTTP; si es 200 OK, redirige al resumen del IRL; si es 400/422, renderiza el arreglo de errores.
2. **Capa de Aplicación y Servicios de Negocio (Node.js/Express):** 
   * **Controladores (`controllers/`):** Reciben la petición HTTP (`PucUploadController`) y coordinan la respuesta (`201` o `422`).
   * **Middlewares (`middlewares/`):** Subida de archivos (`multer` configurado en memoria limitando a 20MB y validando MIME-Type).
   * **Servicios (`services/`):** `CsvParserService` (parsea el CSV y delega la validación estructural) e `IRLCalculatorService` (ejecuta las reglas matemáticas de bandas en memoria de forma pura con `decimal.js`, desacoplado de SQL).
3. **Capa de Modelos de Dominio y Esquemas (`models/`):**
   * Define los contratos de datos, DTOs y esquemas de validación estricta con `Zod` (`PucBatchModel`, `PucRecordModel`, `IRLResultModel`), garantizando que ninguna estructura inválida pase hacia el motor matemático o hacia la base de datos.
4. **Capa de Acceso a Datos / Repositorios (`repositories/`):**
   * `PucRepository` abstrae todas las consultas SQL hacia PostgreSQL (ej. consulta del histórico de los últimos 11 meses de gastos administrativos).
   * Gestiona la persistencia atómica coordinando la inserción en `sarl_puc_batches`, `sarl_puc_records` y `sarl_irl_results`.
5. **Capa de Persistencia (PostgreSQL):** Utiliza transacciones atómicas (`BEGIN`, `COMMIT`, `ROLLBACK`) ejecutadas a través del repositorio para garantizar que no existan estados parciales en la base de datos.

### 2. Modelo de Datos (PostgreSQL)

Dado que el proyecto global corresponde al **Sistema IRL** y este desarrollo es el **Submódulo 1 (Carga de PUC)** dentro del Macro-Módulo **SARL**, el esquema relacional se diseña en 4 entidades desacopladas para permitir que futuros submódulos (Cartera, CDATs, Ahorros, etc.) alimenten el mismo periodo de evaluación sin colisionar:

#### Tabla 1: `sarl_evaluation_periods` (Entidad Maestra Transversal)
Centraliza el periodo contable (`Mes/Año`) evaluado por todos los submódulos de SARL.
* `id` (UUID, PK)
* `period_year` (INT, NOT NULL)
* `period_month` (INT, NOT NULL, `1..12`)
* `status` (VARCHAR) -> `'OPEN'`, `'CALCULATED'`, `'CLOSED'`
* `created_at` (TIMESTAMP)
* **Restricción:** `UNIQUE (period_year, period_month)`

#### Tabla 2: `sarl_puc_batches` (Cabecera de Carga — Submódulo 1)
Registra la cabecera de la carga del PUC. Por regla de negocio estricta, **solo puede existir una carga de PUC por periodo**. Para recargar un mes, el usuario debe eliminar la carga existente.
* `id` (UUID, PK)
* `period_id` (UUID, FK a `sarl_evaluation_periods`, **UNIQUE**, `ON DELETE CASCADE`)
* `status` (VARCHAR) -> `'PROCESSED'`, `'REJECTED'`
* `uploaded_by` (UUID NULL)
* `created_at` (TIMESTAMP)

#### Tabla 3: `sarl_puc_records` (Detalle Contable — Submódulo 1)
Almacena el detalle contable transaccional del mes cargado.
* `id` (UUID, PK)
* `batch_id` (UUID, FK a `sarl_puc_batches`, `ON DELETE CASCADE`)
* `account_code` (VARCHAR(15), Indexado) -> Ej. `'510500'`
* `account_name` (VARCHAR(255))
* `balance` (DECIMAL(19,4)) -> Precisión financiera.

#### Tabla 4: `sarl_irl_band_flows` (Flujos de Bandas por Rubro y Submódulo)
Almacena los flujos calculados en las 4 bandas desglosados por módulo de origen (`source_module`) y concepto (`concept_code`), permitiendo consolidar el Anexo 1 de la Supersolidaria entre múltiples submódulos.
* `id` (UUID, PK)
* `period_id` (UUID, FK a `sarl_evaluation_periods`, `ON DELETE CASCADE`)
* `source_batch_id` (UUID, FK a `sarl_puc_batches`, `ON DELETE CASCADE`)
* `source_module` (VARCHAR(30)) -> Ej. `'MODULO_1_PUC'`
* `flow_type` (VARCHAR(30)) -> `'ACTIVO_LIQUIDO'`, `'ENTRADA'`, `'SALIDA_CONTRACTUAL'`, `'SALIDA_ESTIMADA'`
* `concept_code` (VARCHAR(50)) -> Ej. `'GASTOS_ADMIN'`, `'CREDITOS_911500'`, `'FONDOS_SOCIALES'`
* `base_amount` (DECIMAL(19,4)) -> Valor base o promedio de 12 meses calculado
* `band_1_1_15` (DECIMAL(19,4)) -> Flujo días 1-15
* `band_2_16_30` (DECIMAL(19,4)) -> Flujo días 16-30
* `band_3_31_60` (DECIMAL(19,4)) -> Flujo días 31-60
* `band_4_61_90` (DECIMAL(19,4)) -> Flujo días 61-90
* `created_at` (TIMESTAMP)
* **Restricción:** `UNIQUE (period_id, concept_code)`

### 3. Contratos de API (Endpoints)

#### `POST /api/v1/sarl/puc/upload`
*   **Content-Type:** `multipart/form-data`
*   **Payload:** `file` (.csv), `period_month` (int), `period_year` (int)
*   **Success Response (201 Created):**
    ```json
    {
      "status": "success",
      "data": {
        "period_id": "uuid-period-01",
        "batch_id": "uuid-batch-1234",
        "flows": [
          {
            "concept_code": "GASTOS_ADMIN",
            "base_amount": 25000.00,
            "band_1_1_15": 12500.00,
            "band_2_16_30": 12500.00,
            "band_3_31_60": 25000.00,
            "band_4_61_90": 25000.00
          },
          {
            "concept_code": "CREDITOS_911500",
            "base_amount": 300000.00,
            "band_1_1_15": 150000.00,
            "band_2_16_30": 150000.00,
            "band_3_31_60": 0,
            "band_4_61_90": 0
          }
        ],
        "bands_summary": {
          "band_1": 162500.00,
          "band_2": 162500.00,
          "band_3": 25000.00,
          "band_4": 25000.00
        }
      }
    }
    ```
*   **Error Response - Mes Duplicado (409 Conflict):**
    ```json
    {
      "status": "error",
      "message": "Ya existe un cargue de PUC para el periodo solicitado. Debe eliminar el cargue actual antes de generar uno nuevo.",
      "existing_batch_id": "uuid-batch-1234"
    }
    ```
*   **Error Response - Strict Rejection (422 Unprocessable Entity):**
    ```json
    {
      "status": "error",
      "message": "Validación estructural fallida.",
      "errors": [
        { "row": 14, "account": "911500A", "issue": "Código de cuenta no numérico" },
        { "row": 15, "account": "510500", "issue": "Saldo contiene caracteres inválidos" }
      ]
    }
    ```

#### `DELETE /api/v1/sarl/puc/:batchId`
Elimina el lote cargado del mes junto con sus registros en `sarl_puc_records` y sus flujos asociados en `sarl_irl_band_flows` (vía `ON DELETE CASCADE`), habilitando una nueva carga limpia para ese periodo.
*   **Success Response (200 OK):**
    ```json
    {
      "status": "success",
      "message": "Cargue de PUC y flujos del periodo eliminados correctamente."
    }
    ```

### 4. Algoritmo de Procesamiento en Memoria (Business Logic) y Acceso a Datos

Una vez parseado el CSV a un Array de objetos JSON y superada la validación estructural, el controlador orquestará la consulta de datos históricos a través de `PucRepository` y el cálculo matemático mediante `IRLCalculatorService`:

1.  **Filtro y Sumarización (Reduce):** Extraer los saldos de las cuentas clave (`510500`, `511000`, `911500`, y cuentas de Fondos Sociales).
2.  **Operación Gastos Administrativos:** 
    *   `PucRepository.getHistoricalAdminExpenses(periodYear, periodMonth)` consulta en BD el histórico de los últimos 11 meses de las cuentas `510500` y `511000`.
    *   `IRLCalculatorService` suma el mes actual cargado con el histórico recibido.
    *   Calcula el promedio mensual con precisión decimal (`decimal.js`) y lo asigna a las Salidas Esperadas.
3.  **Operación Créditos Aprobados (Cta. 911500):**
    *   `monto = getBalance('911500')`
    *   `band_1_output += (monto / 2)`
    *   `band_2_output += (monto / 2)`
4.  **Operación Fondos Sociales Pasivos:**
    *   Verificar el mes en evaluación. Si está entre Abril (4) y Diciembre (12), el saldo de la cuenta se divide por los meses restantes del año y se distribuye linealmente en las bandas correspondientes.
5.  **Persistencia Transaccional (`PucRepository.saveBatchWithResults`):**
    *   Recibe la cabecera del lote, los registros limpios del PUC y el DTO de resultados IRL, ejecutando la inserción masiva bajo una única transacción ACID.

### 5. Security-by-Design & Constraints

*   **Límite de Tamaño:** `multer` configurado con `limits: { fileSize: 20 * 1024 * 1024 }` (20MB máximo) para prevenir ataques DDoS por agotamiento de memoria o ancho de banda.
*   **MIME-Type & Magic Numbers:** No confiar solo en la extensión `.csv`. Validar que el `mimetype` sea `text/csv` o `application/vnd.ms-excel`.
*   **CSV Injection (Formula Injection):** Antes de procesar o guardar, sanitizar cadenas que comiencen con `=`, `+`, `-`, `@` para evitar ejecución de macros si los datos se exportan nuevamente a Excel.
*   **Atomicidad (ACID):** Toda la inserción en BD se hará bajo un bloque `try/catch` con `client.query('BEGIN')`. Si alguna validación de negocio falla en la inserción, se ejecuta `client.query('ROLLBACK')`.