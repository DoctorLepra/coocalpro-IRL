CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpiar tablas del diseño anterior si estaban vacías
DROP TABLE IF EXISTS sarl_irl_band_flows CASCADE;
DROP TABLE IF EXISTS sarl_puc_records CASCADE;
DROP TABLE IF EXISTS sarl_puc_batches CASCADE;
DROP TABLE IF EXISTS sarl_evaluation_periods CASCADE;

-- 1. Tabla Detalle Contable del PUC (Submódulo 1 - Filas del CSV por fecha de periodo)
CREATE TABLE IF NOT EXISTS sarl_puc_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_date DATE NOT NULL,
    account_code VARCHAR(15) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    balance DECIMAL(19,4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (period_date, account_code)
);

-- 2. Tabla de Flujos por Bandas IRL (Alimentada por Submódulo 1 y futuros Submódulos)
CREATE TABLE IF NOT EXISTS sarl_irl_band_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_date DATE NOT NULL,
    source_module VARCHAR(30) NOT NULL DEFAULT 'MODULO_1_PUC',
    flow_type VARCHAR(30) NOT NULL CHECK (flow_type IN ('ACTIVO_LIQUIDO', 'ENTRADA', 'SALIDA_CONTRACTUAL', 'SALIDA_ESTIMADA')),
    concept_code VARCHAR(50) NOT NULL,
    base_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_1_1_15 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_2_16_30 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_3_31_60 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_4_61_90 DECIMAL(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (period_date, concept_code)
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_sarl_puc_records_period_account ON sarl_puc_records(period_date, account_code);
CREATE INDEX IF NOT EXISTS idx_sarl_irl_band_flows_period ON sarl_irl_band_flows(period_date, source_module);