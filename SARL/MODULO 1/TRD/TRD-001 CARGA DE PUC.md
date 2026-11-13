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

Se proponen las siguientes entidades normalizadas para este MVP:

#### Tabla: `sarl_puc_batches`
Registra la cabecera de la carga para trazabilidad.
* `id` (UUID, PK)
* `period_month` (INT)
* `period_year` (INT)
* `status` (VARCHAR) -> Ej. 'PROCESSED', 'REJECTED'
* `uploaded_by` (UUID, FK a users)
* `created_at` (TIMESTAMP)

#### Tabla: `sarl_puc_records`
Almacena el detalle contable transaccional del mes.
* `id` (UUID, PK)
* `batch_id` (UUID, FK a sarl_puc_batches)
* `account_code` (VARCHAR(15), Indexado) -> Ej. '510500'
* `account_name` (VARCHAR)
* `balance` (DECIMAL(19,4)) -> Precisión financiera.

#### Tabla: `sarl_irl_results`
Almacena el cálculo resultante de las bandas.
* `id` (UUID, PK)
* `batch_id` (UUID, FK)
* `admin_expenses_avg` (DECIMAL(19,4)) -> Promedio 12 meses (Cuentas 510500, 511000)
* `band_1_1_15` (DECIMAL(19,4)) -> Salidas y entradas esperadas días 1-15
* `band_2_16_30` (DECIMAL(19,4)) -> Salidas y entradas esperadas días 16-30
* `band_3_31_60` (DECIMAL(19,4)) -> Salidas y entradas esperadas días 31-60
* `band_4_61_90` (DECIMAL(19,4)) -> Salidas y entradas esperadas días 61-90

### 3. Contratos de API (Endpoints)

#### `POST /api/v1/sarl/puc/upload`
*   **Content-Type:** `multipart/form-data`
*   **Payload:** `file` (.csv), `period_month` (int), `period_year` (int)
*   **Success Response (201 Created):**
    ```json
    {
      "status": "success",
      "data": {
        "batch_id": "uuid-1234",
        "bands_summary": {
          "band_1": 150000.00,
          "band_2": 150000.00,
          "band_3": 0,
          "band_4": 0
        }
      }
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