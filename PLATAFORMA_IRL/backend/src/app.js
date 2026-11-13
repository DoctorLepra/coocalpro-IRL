// Llamado de dependecias para inicializar el servidor
const express = require("express");
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const pool = require('./config/db');

const app = express();

//Middlwarre de seguridad y monitoreo
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

//Endpoint inicial de cargue y diagnostico del servidor
app.get('/api/v1/health', async(req, res) => {
    try {
        const dataDB = await pool.query('SELECT NOW() AS db_time');
        res.status(200).json({
            status : 'success',
            message : 'API IRL funcional y conectada a PostgreSQL',
            db_time: dataDB.rows[0].db_time
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: 'Error al conectar con PostgreSQl',
            detail: error.message
        });
    }
})

module.exports = app;

