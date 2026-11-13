const {Pool} = require('pg');
require('dotenv').config();

//Se crea conexion a base de datos mediante POOL para gestionar mejor las conexion a la BD generando mas conexiones segun como se requiera con un maximo de 10 conexiones

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max:10,
    idleTimeoutMillis: 3000,
    connectionTimeoutMillis: 5000
});

// Disparadores cuando se realiza la conexion de la BD o se presenta algun error
pool.on('connect', () => {
    console.log('Conexion realizada exitosamente al Pool de PostgreSQL');
});

pool.on('error', (error) => {
    console.log('Error inesperado en el Pool de PostgreSQL:', error.message);
});

module.exports = pool;