const PucModel = require('../../models/sarl/puc.model');
const PucService = require('../../services/sarl/puc.service')
const PucRepository = require('../../repositories/sarl/puc.repository')

class PucController{
    //Carga del archivo CSV
    static async uploadFile(req, res){
        try {
            // Se valida exista el archivo en la peticion 
            if (!req.file) {
                return res.status(400).json({
                    status : 'error',
                    message : 'Debe adjuntar un archvio CSV en el campo "File".'
                });
            }
            
            // Se valida el formato del periodo
            const periodValidation = PucModel.validatePeriod(req.body);
            if (!periodValidation.success) {
                return res.status(400).json({
                    status: 'error',
                    message: periodValidation.error.issues[0].message
                });
            }

            const {period_date} = periodValidation.data;

            //Se verifica la existencia de ese mes dentro de la base de datos.
            const alreadyExists = await PucRepository.existsPeriod(period_date);
            if (alreadyExists) {
                return res.status(409).json({
                    status: 'error',
                    message: `Ya existe un cargue de PUC para el periodo ${period_date}. Debe eliminar el cargue actual antes de generar uno nuevo`,
                    period_date
                });
            }

            //Convertir los datos del CSV a JSON
            const rawRows = PucService.parseBufferToJSON(req.file.buffer);
            const csvValidation = PucService.validateCSVStructure(rawRows);

            if (!csvValidation.isValid) {
                return res.status(422).json({
                    status: 'error',
                    message: 'Validacion estructural fallida. Se rechazo todo el archivo',
                    error: csvValidation.errors
                });
            }

            const cleanRecords = csvValidation.data

            //Consultar el historico de 11 meses atras y calculas las 4 bandas IRL
            const historicalTotals = await PucRepository.getHistoricalAdminExpenses(period_date);
            const calculationResult = PucService.calculatedAllBands(cleanRecords, historicalTotals,period_date);

            //Guardar las cuenta sy las 4 bandas en la BD
            await PucRepository.savePeriodData(period_date,cleanRecords,calculationResult.flows);

            //respuesta de creacion
            return res.status(201).json({
                status: 'success',
                message: 'Archivo PUC procesado y consolidado exitosamente.',
                data: {
                    period_date,
                    total_records_loaded: cleanRecords.length,
                    flows: calculationResult.flows,
                    bands_summary: calculationResult.bands_summary
                }
            });
        } catch (error) {
            return res.status(500).json({
                status: 'error',
                message: 'Error interno al procesar el archivo PUC',
                detail: error.message
            })
        }
    }

    static async deletePeriod(req, res){
        try {
            const {periodDate} = req.params;

            //Se valida el formato de la fecha dentro de la URL
            const periodValidation = PucModel.validatePeriod({period_date: periodDate});
            if (!periodValidation.success) {
                return res.status(400).json({
                    status: 'error',
                    message: periodValidation.error.issues[0].message
                });
            }

            const deleted = await PucRepository.deleteByPeriod(periodDate);

            if(!deleted){
                return res.status(404).json({
                    status: 'error',
                    message: `No se encontro ningun cargue de PUC para el periodo ${periodDate}`
                });
            }

            return res.status(200).json({
                status: 'success',
                message: `Cargue de PUC y flujos del periodo ${periodDate} eliminados exitosamente.`
            })
        } catch (error) {
            return res.status(500).json({
                status: 'error',
                message: 'Error interno al eliminar el periodo',
                detail: error.message
            })
        }
    }
}

module.exports = PucController;