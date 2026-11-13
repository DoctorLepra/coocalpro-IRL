# Diagramas Arquitectónicos UML

## Módulo SARL: Submódulo Carga de PUC (MVP)

A continuación, se presentan los diagramas UML en formato PlantUML (DSL) que describen el comportamiento y la estructura del sistema.

### 1. Diagrama de Secuencia: Flujo Síncrono de Carga y Cálculo

Este diagrama detalla la interacción paso a paso desde el momento en que el usuario suelta el archivo hasta que el sistema responde con éxito o rechaza la carga bajo el patrón *Strict Rejection*.

```plantuml
@startuml
skinparam maxMessageSize 150
autonumber

actor "Analista" as User
participant "Angular UI\n(DropzoneComponent)" as UI
participant "Node.js API\n(PucUploadController)" as Controller
participant "Validation Service\n(CsvParserService)" as Validator
participant "Domain Models\n(PucRecordModel / Zod)" as Model
participant "Calculation Engine\n(IRLCalculatorService)" as Calculator
participant "Data Access Layer\n(PucRepository)" as Repository
database "PostgreSQL\n(SARL_DB)" as DB

User -> UI : Arrastra archivo .csv y click "Procesar"
activate UI
UI -> UI : Validar extensión (.csv) y tamaño local
UI -> UI : Bloquear interfaz (Estado PROCESSING)
UI -> Controller : POST /api/v1/sarl/puc/upload (FormData)
activate Controller

Controller -> Repository : findBatchByPeriod(year, month)
activate Repository
Repository -> DB : SELECT batch por (period_year, period_month)
activate DB
DB --> Repository : Resultado
deactivate DB
Repository --> Controller : Batch existente o null
deactivate Repository

alt Periodo Ya Cargado (Bloqueo de Duplicidad)
    Controller --> UI : HTTP 409 Conflict (Debe eliminar cargue existente)
    UI -> UI : Mostrar alerta y opción de eliminar cargue del mes
    UI --> User : Solicitar eliminación previa
else Periodo Disponible
    Controller -> Validator : Buffer CSV (hasta 20MB)
    activate Validator
    Validator -> Validator : Parsear CSV a JSON y sanitizar celdas
    Validator -> Model : Validar filas contra PucRecordSchema (Zod)
    activate Model
    Model --> Validator : Resultado de validación (Filas válidas o Errores)
    deactivate Model
    alt Estructura Inválida (Strict Rejection)
        Validator --> Controller : Error (Array de filas defectuosas)
        Controller --> UI : HTTP 422 Unprocessable Entity + Errores
        UI -> UI : Cambiar a Estado ERROR_REJECTION
        UI --> User : Renderizar Tabla de Errores
    else Estructura Válida
        Validator --> Controller : Array<PucRecordModel> (Datos Limpios)
        deactivate Validator
        
        Controller -> Repository : getHistoricalAdminExpenses(year, month)
        activate Repository
        Repository -> DB : SELECT histórico de Gastos Admin (Cuentas 510500, 511000)
        activate DB
        DB --> Repository : Histórico 11 meses
        deactivate DB
        Repository --> Controller : Array Histórico
        deactivate Repository

        Controller -> Calculator : Ejecutar cálculo IRL (Datos Limpios + Histórico)
        activate Calculator
        Calculator -> Calculator : Operación Gastos Admin (Promedio con decimal.js)
        Calculator -> Calculator : Operación Créditos (911500) -> 50% Banda 1, 50% Banda 2
        Calculator -> Calculator : Operación Fondos Sociales -> Prorrateo lineal
        Calculator -> Model : Instanciar IRLBandFlowModel[] (Flujos por Concepto)
        activate Model
        Model --> Calculator : Flujos validados + Resumen 4 Bandas
        deactivate Model
        Calculator --> Controller : CalculationResultDTO
        deactivate Calculator
        
        Controller -> Repository : saveBatchWithFlows(periodMeta, cleanRecords, bandFlows)
        activate Repository
        Repository -> DB : BEGIN Transaction
        activate DB
        Repository -> DB : UPSERT sarl_evaluation_periods (Periodo)
        Repository -> DB : INSERT sarl_puc_batches (Cabecera UNIQUE por period_id)
        Repository -> DB : INSERT sarl_puc_records (Detalle masivo)
        Repository -> DB : INSERT sarl_irl_band_flows (Flujos por rubro)
        
        alt Inserción Exitosa
            Repository -> DB : COMMIT Transaction
            DB --> Repository : Éxito
            Repository --> Controller : batch_id
            deactivate Repository
            Controller --> UI : HTTP 201 Created + Resumen Bandas
            UI -> UI : Cambiar a Estado SUCCESS
            UI --> User : Renderizar Dashboard 4 Bandas
        else Inserción Fallida
            Repository -> DB : ROLLBACK Transaction
            deactivate DB
            Repository --> Controller : Throw DatabaseError
            deactivate Repository
            Controller --> UI : HTTP 500 Internal Server Error
            UI -> UI : Cambiar a Estado ERROR_SYSTEM
            UI --> User : Renderizar Pantalla de Fallo Crítico
        end
    end
end
deactivate Controller
deactivate UI
@enduml
```

### 2. Diagrama de Clases: Estructura de Datos y Servicios (Node.js)

Este diagrama modela la relación entre los servicios de negocio principales en el backend y el esquema de la base de datos (PostgreSQL).

```plantuml
@startuml
skinparam classAttributeIconSize 0

package "Capa de Base de Datos (PostgreSQL)" <<Database>> {
    class sarl_evaluation_periods {
        + id : UUID [PK]
        + period_year : INT [UNIQUE]
        + period_month : INT [UNIQUE]
        + status : VARCHAR
        + created_at : TIMESTAMP
    }

    class sarl_puc_batches {
        + id : UUID [PK]
        + period_id : UUID [FK, UNIQUE]
        + status : VARCHAR
        + uploaded_by : UUID
        + created_at : TIMESTAMP
    }

    class sarl_puc_records {
        + id : UUID [PK]
        + batch_id : UUID [FK]
        + account_code : VARCHAR(15)
        + account_name : VARCHAR
        + balance : DECIMAL(19,4)
    }

    class sarl_irl_band_flows {
        + id : UUID [PK]
        + period_id : UUID [FK]
        + source_batch_id : UUID [FK]
        + source_module : VARCHAR(30)
        + flow_type : VARCHAR(30)
        + concept_code : VARCHAR(50)
        + base_amount : DECIMAL(19,4)
        + band_1_1_15 : DECIMAL(19,4)
        + band_2_16_30 : DECIMAL(19,4)
        + band_3_31_60 : DECIMAL(19,4)
        + band_4_61_90 : DECIMAL(19,4)
        + created_at : TIMESTAMP
    }

    sarl_evaluation_periods "1" -- "0..1" sarl_puc_batches : period_id (UNIQUE)
    sarl_evaluation_periods "1" -- "0..*" sarl_irl_band_flows : period_id
    sarl_puc_batches "1" -- "0..*" sarl_puc_records : batch_id (CASCADE)
    sarl_puc_batches "1" -- "0..*" sarl_irl_band_flows : source_batch_id (CASCADE)
}

package "Capa de Controladores y Servicios (Node.js)" <<Node>> {
    
    class PucUploadController {
        + uploadFile(req: Request, res: Response) : Promise<void>
        + deleteBatch(req: Request, res: Response) : Promise<void>
    }

    class CsvParserService {
        + parseBufferToJSON(buffer: Buffer) : Array<Object>
        + validateStructure(data: Array<Object>) : ValidationResult
        - sanitizeInput(cell: String) : String
    }

    class IRLCalculatorService {
        + calculateBands(cleanData: Array<PucRecordModel>, history: Array<Object>, month: INT) : Array<IRLBandFlowModel>
        - calculateAdminExpenses(currentData: Array, history: Array) : Decimal
        - distributeUnpaidCredits(balance: Decimal) : BandDistributionDTO
        - prorateSocialFunds(balance: Decimal, currentMonth: INT) : BandDistributionDTO
    }
}

package "Capa de Modelos de Dominio y Esquemas (Node.js / Zod)" <<Models>> {

    class PucBatchModel {
        + period_month : INT
        + period_year : INT
        + status : VARCHAR
        + uploaded_by : UUID
        + validate(input: Object) : PucBatchModel
    }

    class PucRecordModel {
        + account_code : String
        + account_name : String
        + balance : Decimal
        + validateRow(rawRow: Object, rowNumber: INT) : ValidationOutcome
    }

    class IRLBandFlowModel {
        + source_module : String
        + flow_type : String
        + concept_code : String
        + base_amount : Decimal
        + band_1_1_15 : Decimal
        + band_2_16_30 : Decimal
        + band_3_31_60 : Decimal
        + band_4_61_90 : Decimal
    }
}

package "Capa de Acceso a Datos / Repositorios (Node.js)" <<Repository>> {

    class PucRepository {
        - dbPool : Pool
        + findBatchByPeriod(year: INT, month: INT) : Promise<Object|null>
        + deleteBatchById(batchId: UUID) : Promise<Boolean>
        + getHistoricalAdminExpenses(year: INT, month: INT) : Promise<Array<Object>>
        + saveBatchWithFlows(batch: PucBatchModel, records: Array<PucRecordModel>, flows: Array<IRLBandFlowModel>) : Promise<UUID>
    }
}

PucUploadController --> CsvParserService : usa
PucUploadController --> IRLCalculatorService : usa
PucUploadController --> PucRepository : usa
CsvParserService ..> PucRecordModel : valida con
IRLCalculatorService ..> IRLBandFlowModel : construye
PucRepository ..> PucBatchModel : recibe
PucRepository ..> PucRecordModel : recibe
PucRepository ..> IRLBandFlowModel : recibe
PucRepository ..> sarl_evaluation_periods : gestiona
PucRepository ..> sarl_puc_batches : inserta/elimina (ACID)
PucRepository ..> sarl_puc_records : inserta (Batch ACID)
PucRepository ..> sarl_irl_band_flows : consulta e inserta (ACID)
@enduml
```