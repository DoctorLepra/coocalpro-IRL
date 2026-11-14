const {parse} = require('csv-parse/sync');
const Decimal = require('decimal.js');
const PucModel = require('../../models/sarl/puc.model');

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
}

module.exports = PucService;