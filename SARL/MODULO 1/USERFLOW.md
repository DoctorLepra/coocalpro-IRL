# User Flow: Mapeo de Estados de Navegación

## Módulo SARL: Submódulo Carga de PUC (MVP)

**Document Status:** Draft
**UI/UX Paradigm:** Minimalismo Guiado & Strict Rejection
**Frontend Framework:** Angular

---

### 1. Mapa de Estados de la Interfaz (State Machine)

La interfaz del submódulo operará bajo una máquina de estados finita estricta para evitar inconsistencias (ej. doble envío de archivos).

#### Estado 0: [IDLE] - Pantalla de Inicio
*   **Visualización:** Área de *Dropzone* (Drag-and-Drop) limpia ocupando el centro de la pantalla. Texto instruccional claro: "Arrastra el archivo PUC del mes (.csv) o haz clic para explorar".
*   **Acción del Usuario:** Arrastrar un archivo al área designada o hacer clic para abrir el explorador del sistema operativo.
*   **Validación Local (Pre-vuelo):** 
    *   Angular verifica inmediatamente la extensión del archivo (`.csv`) y el tamaño (<= 20MB). 
    *   *Si falla localmente:* Muestra un Toast/Snackbar de error instantáneo y permanece en el Estado [IDLE].
*   **Transición:** Si la validación local es exitosa, el usuario hace clic en un botón primario "Procesar Archivo" -> Pasa al Estado [PROCESSING].

#### Estado 1: [PROCESSING] - Procesamiento Síncrono
*   **Visualización:** El *Dropzone* se transforma en un indicador de carga (Spinner o Progress Bar animada). Toda la interfaz subyacente y los botones se deshabilitan (UI bloqueada). Se muestra el texto: "Analizando estructura y calculando bandas de riesgo... Por favor, no cierre esta ventana."
*   **Acción del Usuario:** Ninguna (Espera síncrona).
*   **Proceso del Sistema:** Angular emite la petición `POST /upload` al backend Node.js y espera la respuesta HTTP.
*   **Transición:**
    *   Si Backend responde `201 Created` -> Pasa al Estado [SUCCESS].
    *   Si Backend responde `409 Conflict` (El mes/año ya fue cargado previamente) -> Muestra alerta de conflicto con la opción de eliminar el cargue anterior de ese mes para poder subir uno nuevo.
    *   Si Backend responde `422 Unprocessable Entity` (Fallo estructural/lógico) -> Pasa al Estado [ERROR_REJECTION].
    *   Si Backend responde `500/504` (Error de red/servidor) -> Pasa al Estado [ERROR_SYSTEM].

#### Estado 2: [SUCCESS] - Dashboard de Resultados
*   **Visualización:** El *Dropzone* desaparece. Se renderiza un panel de resumen (Dashboard) mostrando:
    *   Mensaje de Éxito: "Archivo procesado y consolidado correctamente."
    *   Tarjeta de Resumen: Periodo evaluado (Mes/Año).
    *   4 Tarjetas Numéricas (Las 4 Bandas de Liquidez): 
        *   Banda 1 (1-15 días): $ Valor
        *   Banda 2 (16-30 días): $ Valor
        *   Banda 3 (31-60 días): $ Valor
        *   Banda 4 (61-90 días): $ Valor
*   **Acción del Usuario:** Revisar los datos. Hacer clic en "Cargar nuevo mes" (Regresa al Estado [IDLE]).

#### Estado 3: [ERROR_REJECTION] - Strict Rejection Log
*   **Visualización:** El *Dropzone* desaparece. Se muestra una alerta roja destacada: "Carga Rechazada: Se encontraron inconsistencias en el archivo".
*   **Componente Clave:** Una tabla de datos (*Data Grid*) que lista los errores devueltos por el backend:
    *   Columna 1: Fila en el archivo CSV (ej. Fila 145)
    *   Columna 2: Cuenta Contable (ej. 911500)
    *   Columna 3: Motivo del Rechazo (ej. "El saldo contiene caracteres alfabéticos").
*   **Acción del Usuario:** Analizar la tabla para corregir su archivo fuente en Excel/Sistema Contable. Hacer clic en "Intentar de nuevo" (Regresa al Estado [IDLE]).

#### Estado 4: [ERROR_SYSTEM] - Fallo Crítico
*   **Visualización:** Pantalla de error genérico informando un problema de comunicación con el servidor. 
*   **Acción del Usuario:** Botón "Reintentar conexión" (Regresa al Estado [IDLE]).

---

### 2. Flujo de Diagrama (Pathways)

```text
[Inicio: Menú Principal SARL] 
       |
       v
+-------------------+
|  [IDLE] Dropzone  | <-----------------------------------------+
+-------------------+                                           |
       | (Sube archivo CSV y presiona Procesar)                 |
       v                                                        |
+-------------------+                                           |
|   [PROCESSING]    | (Bloqueo de UI)                           |
+-------------------+                                           |
       |                                                        |
       +-------------------------------+                        |
       | (HTTP 201)                    | (HTTP 422)             |
       v                               v                        |
+-------------------+       +-----------------------+           |
|     [SUCCESS]     |       |   [ERROR_REJECTION]   |           |
| Dashboard Bandas  |       | Tabla de Errores CSV  |           |
+-------------------+       +-----------------------+           |
       |                               |                        |
       | (Click "Nuevo")               | (Click "Reintentar")   |
       +-------------------------------+------------------------+
```

### 3. Consideraciones de UX (Prevención de Errores)
*   **Confirmación de Salida:** Si el usuario intenta recargar la página (`F5`) o navegar hacia atrás mientras se encuentra en el Estado `[PROCESSING]`, Angular debe interceptar el evento (`HostListener('window:beforeunload')`) y mostrar una alerta nativa del navegador advirtiendo que se interrumpirá el procesamiento del archivo.