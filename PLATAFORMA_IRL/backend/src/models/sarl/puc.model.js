// Se importan las librerias de ZOD y DECIMAL
const {z} = require('zod');
const Decimal = require('decimal.js')

//Zod es una libreria que ayuda a construir un CONSTRUCTOR con validaciones mucho mas sencillo, creando los atributos del modelo con validaciones a traves de objetos

//Creamos el objeto PeriodSchema para capturar la fecha (mes y ano) del puc a validar
const PeriodSchema = z.object({
    period_date: z
        .string({message: 'La fecha del periodo es obligatoria'})
        .trim()
        .regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/, 'El periodo debe tener formato YYYY-MM-DD (ej. 2026-10-01)'),
});

// Creamos el objeo RecordSchema para capturar los valores de cuenta, descripcion y saldo del PUC
const RecordSchema = z.object({
    account_code: z
        .string()
        .trim()
        .min(1, 'El codigo de cuenta esta vacio')
        .regex(/^\d+$/, 'Código de cuenta no numérico'),
    account_name: z
        .string()
        .trim()
        .min(1, 'La descripcion de la cuenta esta vacia'),
    balance: z
        .string()
        .trim()
        .refine((val) => {
            if (!val) return false;
            try {
                return new Decimal(val).isFinite();
            } catch (error) {
                return false;
            }
        }, 'Saldo contiente caracteres invalidos o no es numerico')
        .transform((val) => new Decimal(val)),
});

//Metodos
class PucModel {
    //Valida la fecha del periodo
    static validatePeriod(input){
        return PeriodSchema.safeParse(input);
    }

    //Normaliza las cabeceras del archivo CSV y captura los daots en las variables del sistema
    static validateRecordRow(rawRow, rowNumber){
        const normalized = {
            account_code: String(rawRow.CUENTA ?? rawRow.cuenta ?? ''),
            account_name: String(rawRow.DESCRIPCION ?? rawRow.descripcion ?? ''),
            balance:  String(rawRow.Saldo ?? rawRow.SALDO ?? '')
        };

        const result = RecordSchema.safeParse(normalized);

        if(!result.success){
            const issues = result.error.issues.map((err) => err.message).join('; ');
            return {
                isValid : false,
                error : {
                    row: rowNumber,
                    account: normalized.account_code || 'SIN CODIGO',
                    issue: issues
                },
            };
        }

        return{
            isValid: true,
            data: result.data
        };

    }

    // Da formato Decimal(19,4) a cada flujo calculado de las 4 bandas
    static createBandFlow({
        period_date,
        source_module = 'PUC',
        flow_type,
        concept_code,
        base_amount = 0,
        band_1_1_15 = 0,
        band_2_16_30 = 0,
        band_3_31_60 = 0,
        band_4_61_90 = 0
    }) {
        return {
            period_date,
            source_module,
            flow_type,
            concept_code,
            base_amount: new Decimal(base_amount).toFixed(4),
            band_1_1_15: new Decimal(band_1_1_15).toFixed(4),
            band_2_16_30: new Decimal(band_2_16_30).toFixed(4),
            band_3_31_60: new Decimal(band_3_31_60).toFixed(4),
            band_4_61_90: new Decimal(band_4_61_90).toFixed(4)
        };
    }

}
   
module.exports = PucModel;