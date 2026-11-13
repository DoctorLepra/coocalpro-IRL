# Product Requirements Document (PRD)
## Módulo SARL: Submódulo Carga de PUC (MVP)

**Document Status:** Draft  
**Target Architecture:** Stack 2026 (Angular, Node.js, SQL en VPS)  
**Paradigm:** Reasoning-before-Action (R-b-A)

---

### 1. Propósito y Contexto del Producto
El propósito de este producto es desarrollar el submódulo "Cargar el PUC" perteneciente al Macro Módulo SARL (Sistema de Administración del Riesgo de Liquidez). Este sistema permitirá a las cooperativas financieras cargar el Plan Único de Cuentas (PUC) de su sistema contable correspondiente al mes a evaluar. El objetivo final es automatizar el cálculo del Indicador de Riesgo de Liquidez (IRL) exigido por la Superintendencia de la Economía Solidaria (Anexo 1), minimizando errores humanos y estandarizando la estructuración de la información.

### 2. Usuarios Objetivo
*   **Analista de Riesgos / Contador:** Usuario principal. Necesita una herramienta rápida, libre de fricciones y clara para cargar su balanza de comprobación mensual. Valora el *feedback* inmediato sobre errores estructurales en sus archivos.
*   **Gerencia Financiera:** Usuario secundario. Depende de la precisión del cálculo matemático final sobre las bandas temporales.

### 3. Principios de Experiencia de Usuario (UX/UI)
*   **Minimalismo Guiado:** La interfaz carecerá de paneles de configuración complejos. El núcleo será una *Dropzone* (área de Drag-and-Drop) limpia y centralizada.
*   **Feedback Inmediato y Síncrono:** El analista no debe "adivinar" el estado del sistema. Existirán indicadores de progreso visuales durante el procesamiento.
*   **Tolerancia Cero a la Incertidumbre (Strict Rejection):** Si el archivo falla, el usuario no debe navegar por menús ocultos. Se desplegará un *Error Log* en pantalla con la línea exacta y la causa del fallo contable o de formato.

### 4. Requerimientos Funcionales (User Stories & Acceptance Criteria)

#### US-01: Carga de Archivo PUC
**Como** analista financiero, **quiero** cargar mi archivo PUC en formato `.csv` a través de un área de *drag-and-drop*, **para** que el sistema extraiga los saldos contables del mes.
*   **Criterio de Aceptación 1:** El sistema solo permite archivos `.csv`. Cualquier otra extensión será rechazada visualmente en el frontend antes del envío.
*   **Criterio de Aceptación 2:** La interfaz muestra un indicador de "Cargando..." que bloquea acciones adicionales durante la validación sincrónica.

#### US-02: Validación Estructural, Control de Unicidad Mensual y Rechazo Estricto (Strict Rejection)
**Como** analista financiero, **quiero** que el sistema valide la estructura de mi archivo y verifique que el mes no haya sido cargado previamente antes de procesarlo, **para** garantizar que no hay datos corruptos, cuentas no válidas ni duplicidad de periodos contables.
*   **Criterio de Aceptación 1:** El backend lee el archivo e identifica cabeceras y tipos de datos. Si detecta un error, se aborta toda la operación (No hay inserción parcial en base de datos).
*   **Criterio de Aceptación 2:** El sistema devuelve una tabla de errores al usuario mostrando: `Número de Fila | Código de Cuenta | Descripción del Error (ej. "Monto no numérico", "Cuenta no existe en catálogo")`.
*   **Criterio de Aceptación 3 (Bloqueo de Mes Duplicado):** El sistema no permitirá subir un archivo PUC para un periodo (`Mes/Año`) que ya tenga un cargue registrado. Si el periodo ya existe, rechazará la solicitud indicando al usuario que debe eliminar primero el cargue existente de ese mes para poder generar uno nuevo.
*   **Criterio de Aceptación 4 (Eliminación de Cargue Mensual):** El usuario podrá eliminar el cargue de un mes existente, lo cual borrará en cascada sus saldos contables y los flujos calculados por este submódulo para habilitar una nueva carga limpia.

#### US-03: Cálculo de Exigibilidades y Bandas Temporales (Core Business Logic)
**Como** gerente de riesgos, **quiero** que el sistema procese automáticamente las reglas de liquidez sobre el archivo PUC limpio, **para** tener una proyección exacta del requerimiento de caja en 4 bandas temporales.
*   **Criterio de Aceptación 1 (Bandas):** El sistema debe abstraer el resultado en 4 bandas (1-15 días, 16-30 días, 31-60 días, 61-90 días).
*   **Criterio de Aceptación 2 (Gastos Administrativos):** El sistema identificará las cuentas *510500 (Beneficios a empleados)* y *511000 (Gastos generales)*, extrayendo los últimos 12 meses (de la BD histórica) para calcular un promedio mensual (Salida esperada contractual).
*   **Criterio de Aceptación 3 (Créditos Aprobados no Desembolsados):** El saldo de la cuenta *911500* será extraído y dividido algorítmicamente en partes iguales al 50% entre la Banda 1 (1-15 días) y la Banda 2 (16-30 días).
*   **Criterio de Aceptación 4 (Fondos Sociales Pasivos):** El motor calculará una salida lineal (distribución equitativa) desde el mes de abril hasta diciembre para el saldo correspondiente.

### 5. Requerimientos No Funcionales
*   **Rendimiento:** El tiempo de respuesta para la validación y cálculo en un archivo de hasta 10MB no debe superar los 5 segundos (Ejecución sincrónica exigida por MVP).
*   **Seguridad-by-Design:**
    *   *Input Sanitization:* El backend en Node.js debe desinfectar todas las filas del `.csv` (prevención de CSV Injection).
    *   *Limitación de Carga:* Restricción de tamaño máximo de archivo (ej. 20MB) en capa Nginx y Node.js.
*   **Persistencia:** Solo se escribirá en la base de datos relacional (PostgreSQL/MySQL) si y solo si la totalidad del archivo pasa el *Strict Rejection* y el cálculo en memoria es exitoso (Transacción atómica).

### 6. Métricas de Éxito del MVP
*   100% de coincidencia entre el cálculo manual del analista (en Excel) y el output arrojado por el sistema para los Gastos Administrativos y Créditos no desembolsados.
*   Tasa de errores de estructura informados correctamente > 99%.