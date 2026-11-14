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
participant "Domain Model\n(PucModel / Zod)" as Model
participant "Calculation Engine\n(IRLCalculatorService)" as Calculator
participant "Data Access Layer\n(PucRepository)" as Repository
database "PostgreSQL\n(SARL_DB)" as DB

User -> UI : Arrastra archivo .csv y click "Procesar"
activate UI
UI -> UI : Validar extensión (.csv) y tamaño local
UI -> UI : Bloquear interfaz (Estado PROCESSING)
UI -> Controller : POST /api/v1/sarl/puc/upload (FormData)
activate Controller

Controller -> Model : validatePeriod(period_date)
activate Model
Model --> Controller : period_date válido (YYYY-MM-DD)
deactivate Model

Controller -> Repository : existsPeriod(period_date)
activate Repository
Repository -> DB : SELECT 1 FROM sarl_puc_records WHERE period_date = $1 LIMIT 1
activate DB
DB --> Repository : Resultado
deactivate DB
Repository --> Controller : Boolean (Existe o no)
deactivate Repository

alt Periodo Ya Cargado (Bloqueo de Duplicidad)
    Controller --> UI : HTTP 409 Conflict (Debe eliminar cargue existente)
    UI -> UI : Mostrar alerta y opción de eliminar cargue del mes
    UI --> User : Solicitar eliminación previa
else Periodo Disponible
    Controller -> Validator : Buffer CSV (hasta 20MB)
    activate Validator
    Validator -> Validator : Parsear CSV a JSON y sanitizar celdas
    Validator -> Model : validateRecordRow(rawRow, rowNumber) [CUENTA, DESCRIPCION, Saldo]
    activate Model
    Model --> Validator : Resultado de validación (Filas válidas con Decimal o Errores)
    deactivate Model
    alt Estructura Inválida (Strict Rejection)
        Validator --> Controller : Error (Array de filas defectuosas)
        Controller --> UI : HTTP 422 Unprocessable Entity + Errores
        UI -> UI : Cambiar a Estado ERROR_REJECTION
        UI --> User : Renderizar Tabla de Errores
    else Estructura Válida
        Validator --> Controller : Array<CleanRecord> (Datos Limpios)
        deactivate Validator
        
        Controller -> Repository : getHistoricalAdminExpenses(period_date)
        activate Repository
        Repository -> DB : SELECT histórico 11 meses (period_date - INTERVAL '11 months')
        activate DB
        DB --> Repository : Histórico 11 meses
        deactivate DB
        Repository --> Controller : Array Histórico
        deactivate Repository

        Controller -> Calculator : Ejecutar cálculo IRL (Datos Limpios + Histórico + period_date)
        activate Calculator
        Calculator -> Calculator : Operación Gastos Admin (Promedio con decimal.js)
        Calculator -> Calculator : Operación Créditos (911500) -> 50% Banda 1, 50% Banda 2
        Calculator -> Calculator : Operación Fondos Sociales -> Prorrateo lineal
        Calculator -> Model : createBandFlow(...) (Formatear flujos a Decimal(19,4))
        activate Model
        Model --> Calculator : Flujos validados
        deactivate Model
        Calculator --> Controller : CalculationResultDTO
        deactivate Calculator
        
        Controller -> Repository : savePeriodData(period_date, cleanRecords, bandFlows)
        activate Repository
        Repository -> DB : BEGIN Transaction
        activate DB
        Repository -> DB : INSERT sarl_puc_records (Detalle masivo del mes)
        Repository -> DB : INSERT sarl_irl_band_flows (Flujos por rubro del mes)
        
        alt Inserción Exitosa
            Repository -> DB : COMMIT Transaction
            DB --> Repository : Éxito
            Repository --> Controller : OK
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
    class sarl_puc_records {
        + id : UUID [PK]
        + period_date : DATE [INDEX]
        + account_code : VARCHAR(15)
        + account_name : VARCHAR(255)
        + balance : DECIMAL(19,4)
        + created_at : TIMESTAMP
    }

    class sarl_irl_band_flows {
        + id : UUID [PK]
        + period_date : DATE [INDEX]
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

    sarl_puc_records "1..*" .. "1..*" sarl_irl_band_flows : period_date (DATE)
}

package "Capa de Controladores y Servicios (Node.js)" <<Node>> {
    
    class PucUploadController {
        + uploadFile(req: Request, res: Response) : Promise<void>
        + deletePeriod(req: Request, res: Response) : Promise<void>
    }

    class CsvParserService {
        + parseBufferToJSON(buffer: Buffer) : Array<Object>
        + validateStructure(data: Array<Object>) : ValidationResult
        - sanitizeInput(cell: String) : String
    }

    class IRLCalculatorService {
        + calculateBands(cleanData: Array<Object>, history: Array<Object>, periodDate: String) : Array<Object>
        - calculateAdminExpenses(currentData: Array, history: Array) : Decimal
        - distributeUnpaidCredits(balance: Decimal) : BandDistributionDTO
        - prorateSocialFunds(balance: Decimal, currentMonth: INT) : BandDistributionDTO
    }
}

package "Capa de Modelos de Dominio y Esquemas (Node.js / Zod)" <<Models>> {

    class PucModel {
        + {static} PeriodSchema : ZodObject
        + {static} RecordSchema : ZodObject
        + {static} validatePeriod(input: Object) : SafeParseReturnType
        + {static} validateRecordRow(rawRow: Object, rowNumber: INT) : ValidationOutcome
        + {static} createBandFlow(flowData: Object) : BandFlowDTO
    }
}

package "Capa de Acceso a Datos / Repositorios (Node.js)" <<Repository>> {

    class PucRepository {
        - dbPool : Pool
        + existsPeriod(periodDate: String) : Promise<Boolean>
        + deleteByPeriod(periodDate: String) : Promise<Boolean>
        + getHistoricalAdminExpenses(periodDate: String) : Promise<Array<Object>>
        + savePeriodData(periodDate: String, records: Array<Object>, flows: Array<Object>) : Promise<void>
    }
}

PucUploadController --> CsvParserService : usa
PucUploadController --> IRLCalculatorService : usa
PucUploadController --> PucRepository : usa
PucUploadController ..> PucModel : valida period_date con
CsvParserService ..> PucModel : valida filas CSV con
IRLCalculatorService ..> PucModel : formatea flujos con
PucRepository ..> sarl_puc_records : consulta/inserta/elimina (ACID)
PucRepository ..> sarl_irl_band_flows : consulta/inserta/elimina (ACID)
@enduml
```