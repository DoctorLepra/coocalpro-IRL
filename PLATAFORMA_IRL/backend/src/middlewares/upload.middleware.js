// llamado de dependencias
const multer = require('multer');
const path = require('path');

// Se crean constante que tendran el tamano maximo del archivo definido en el .env
const MAX_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// Se crea la constante storage que llama a la libreria multer con el metodo memoryStorage para que el cargue del CSV se alamcene dentro de la RAM para un procesamiento mas rapido
const storage = multer.memoryStorage();

// Se agregan filtros de validacion de extension .csv y MIME-TYPE
const fileFilter = (req, file, cb) => {
    //Se captura el formato y naturaleza dle archivo
    const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    // Se captura la extension del archivo y se parsea a minusculas
    const ext = path.extname(file.originalname).toLowerCase();

    //Se hace validacion de extension y MIME Type
    if (ext === '.csv' && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato invalido. Solo se permiten archivos .csv'));
    }
};

// Se crea instnacia de multer
const upload = multer({
    storage,
    limits: {fileSize: MAX_SIZE_BYTES},
    fileFilter
});

//Middleware envoltorio para arrojar error limpios
const uploadCsv = (req, res, next) => {
    //Espera el campo 'file' que se trae desde el formulario de carga de archivo
    const singleUpload = upload.single('file');

    //Funcion para presentar error de manera clara
    singleUpload(req, res, (err) => {
        if (err instanceof multer.MulterError){
            // Si el archivo excede el tamano permitido
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(403).json({
                    status: 'error',
                    message: `El archivo excede el tamaño maximo permitido de ${MAX_SIZE_MB}MB`
                });
            }
            // Si no se pudo cargar el archivo
            return res.status(400).json({
                status: 'error',
                message: `error en la carga del archivo: ${err.message}` 
            });
        }
        // Si hubo un error diferente
        if (err){
            return res.status(400).json({
                status: 'error',
                message: err.message
            });
        }

        // Si no hay error pasa al controlador
        next();
    });

};

module.exports = {uploadCsv}