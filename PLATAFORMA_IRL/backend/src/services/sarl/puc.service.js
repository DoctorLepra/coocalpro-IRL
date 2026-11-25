const {parse} = require('csv-parse/sync');
const Decimal = require('decimal.js');
const PucModel = require('../../models/sarl/puc.model');
const { record } = require('zod');

class PucService {
    //Funcion para limpiar el csv y prevenir CSV Injection
    static sanitizeText(value){
        if (typeof value !== 'string') return '';
        return value.replace(/^[=+\-@]+/, '').trim();
    }

    //Funcion para limpiar valores $ y espacio en blanco en saldo
    static cleanBalanceString(value){
        if (typeof value !== 'string') return '';
        return value.replace(/[$\s]/g, '').trim();
    }

    //Funcion para convertir el csv almacenado en RAM a JSON
    static parseBufferToJSON(buffer){
        try {
            return parse(buffer,{
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
                delimiter: [',',';']
            })
        } catch (error) {
            throw new Error(`El archivo CSV tiene un formato ilegible: ${error.message}`);
        }
    }

    //Funcion para validar que el archivo CSV contenga informacion
    static validateCSVStructure(rawRows){
        //Validacion si el archvio viene vacio
        if (!Array.isArray(rawRows) || rawRows.length == 0){
            return {
                isValid : false,
                errors: [
                    {
                        row: 1,
                        account: 'N/A',
                        issue: 'El archivo CSV esta vacio o no contiene registros contables'
                    },
                ],
            };
        }

        const cleanRecords = [];
        const errors = [];

        rawRows.forEach((rawRow, index) => {
            //Inicializador de columnas con datos contable
            const excelRowNumber = index + 2;

            const sanitizedRow = {
                CUENTA: this.sanitizeText(String(rawRow.CUENTA ?? rawRow.cuenta ?? '')),
                DESCRIPCION: this.sanitizeText(String(rawRow.DESCRIPCION ?? rawRow.descripcion ?? '')),
                Saldo: this.cleanBalanceString(rawRow.Saldo ?? rawRow.SALDO ?? rawRow.saldo ?? '')
            };

            const validation = PucModel.validateRecordRow(sanitizedRow, excelRowNumber);

            if (!validation.isValid){
                errors.push(validation.error);
            } else {
                cleanRecords.push(validation.data);
            }
        });

        if (errors.length > 0){
            return {
                isValid : false,
                errors
            };
        }

        return {
            isValid: true,
            data: cleanRecords
        };
    }


    // Calculos matematicos para las bandas del     PUC
    static getAccountBalance(cleanRecords, accountCode){
        const found = cleanRecords.find((record) => record.account_code === accountCode);
        return found ? new Decimal(found.balance) : new Decimal(0);

    }

    // Captura de gastos administrativos de las cuentas 510500 y 511000 | en un prmoedio de 12 meses
    static calculatedAdminExpenses(cleanRecords,historicalTotal = [], period_date){
        const current510500 = this.getAccountBalance(cleanRecords, '510500');
        const current511000 = this.getAccountBalance(cleanRecords, '511000');
        const currentMonthTotal = current510500.plus(current511000);

        //Se suman los total de meses historicos disponibles
        let accumulatedTotal = currentMonthTotal;
        historicalTotal.forEach((histRow) => {
            accumulatedTotal = accumulatedTotal.plus(new Decimal(histRow.monthTotal || 0));
        });

        //Divisor dinamico: mes actual + cantidad de meses historicos encontrados
        const availableMonths = historicalTotal.length + 1;
        const monthlyAverage = accumulatedTotal.dividedBy(availableMonths);
        const halfMonth = monthlyAverage.dividedBy(2);

        return PucModel.createBandFlow({
            period_date : period_date,
            flow_type : 'SALIDA_ESTIMADA',
            concept_code : 'GASTOS_ADMIN',
            base_amount : monthlyAverage,
            band_1_1_15 : halfMonth,
            band_2_16_30 : halfMonth,
            band_3_31_60 : monthlyAverage,
            band_4_61_90 : monthlyAverage
        });
    }

    // Captura de creditos aprobados no desembolsados (Cuenta 911500 -> 50% Banda 1, 50% Banda 2)

    static calculatedUnpaidCredits(cleanRecords, periodDate){
        const balance911500 = this.getAccountBalance(cleanRecords, '911500');
        const halfBalance = balance911500.dividedBy(2);

        return PucModel.createBandFlow({
            period_date: periodDate,
            flow_type: 'SALIDA_CONTRACTUAL',
            concept_code : 'CREDITOS_911500',
            base_amount : balance911500,
            band_1_1_15 : halfBalance,
            band_2_16_30 : halfBalance,
            band_3_31_60 : 0,
            band_4_61_90 : 0
        });
    }

    // Fondos sociales pasivos (Grupoi de cuentas 26)
    static calculatedSocialFunds(cleanRecords, periodDate){
        // Se valida que la cuenta 260000 tenga saldo, si no se toman los valores de la cuentas 260500 y 261000 y sumarlos
        let socialBalance = this.getAccountBalance(cleanRecords, '260000');
        if (socialBalance.isZero()) {
            socialBalance = this.getAccountBalance(cleanRecords, '260500')
                .plus(this.getAccountBalance(cleanRecords, '261000'));
        }

        //Se extrae el mes del periodDate
        const currentMonth = Number(periodDate.split('-')[1]);

        let monthlyQuota = new Decimal(0);
        if (currentMonth >= 4 && currentMonth <=12){
            const remaingMonths = 12 - currentMonth + 1;
            monthlyQuota = socialBalance.dividedBy(remaingMonths)
        }

        const halfQuota = monthlyQuota.dividedBy(2);

        return PucModel.createBandFlow({
            period_date: periodDate,
            flow_type: 'SALIDA_ESTIMADA',
            concept_code : 'FONDOS_SOCIALES',
            base_amount : socialBalance,
            band_1_1_15 : halfQuota,
            band_2_16_30 : halfQuota,
            band_3_31_60 : monthlyQuota,
            band_4_61_90 : monthlyQuota
        });
    }

    // Orquestador: ejecuta las funciones anterios y consolida el resumen de las 4 bandas
    static calculatedAllBands(cleanRecords, historicalTotal, periodDate){
        const adminFlow = this.calculatedAdminExpenses(cleanRecords,historicalTotal, periodDate);
        const creditsFlow = this.calculatedUnpaidCredits(cleanRecords, periodDate);
        const socialFlow = this.calculatedSocialFunds(cleanRecords,periodDate);

        const flows = [adminFlow, creditsFlow, socialFlow];

        //Se suman las 4 bandas con todos los flujos
        const summary = flows.reduce(
            (acc, flow) => ({
                band_1: acc.band_1.plus(new Decimal(flow.band_1_1_15)),
                band_2: acc.band_2.plus(new Decimal(flow.band_2_16_30)),
                band_3: acc.band_3.plus(new Decimal(flow.band_3_31_60)),
                band_4: acc.band_4.plus(new Decimal(flow.band_4_61_90))
            }),
            {
                // Se definen los valores iniciales de las bandas
                band_1: new Decimal(0),
                band_2: new Decimal(0),
                band_3: new Decimal(0),
                band_4: new Decimal(0)
            }
        );

        return {
            flows,
            bands_summary: {
                band_1: summary.band_1.toFixed(4),
                band_2: summary.band_2.toFixed(4),
                band_3: summary.band_3.toFixed(4),
                band_4: summary.band_4.toFixed(4),
            }
        }
    }

}

module.exports = PucService;