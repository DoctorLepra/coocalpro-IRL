-- Habilita la generación automática de UUIDs en PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabla Maestra de Periodos de Evaluación SARL (Transversal a todos los submódulos)
CREATE TABLE IF NOT EXISTS sarl_evaluation_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_year INT NOT NULL CHECK (period_year >= 2000),
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CALCULATED', 'CLOSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (period_year, period_month)
);

-- 2. Tabla Cabecera de Carga de PUC (Submódulo 1 - Máximo 1 carga por Periodo)
CREATE TABLE IF NOT EXISTS sarl_puc_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL UNIQUE REFERENCES sarl_evaluation_periods(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PROCESSED', 'REJECTED')),
    uploaded_by UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla Detalle Contable del PUC (Submódulo 1 - Filas del CSV)
CREATE TABLE IF NOT EXISTS sarl_puc_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES sarl_puc_batches(id) ON DELETE CASCADE,
    account_code VARCHAR(15) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    balance DECIMAL(19,4) NOT NULL
);

-- 4. Tabla de Flujos por Bandas IRL (Alimentada por Submódulo 1 y futuros Submódulos)
CREATE TABLE IF NOT EXISTS sarl_irl_band_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES sarl_evaluation_periods(id) ON DELETE CASCADE,
    source_batch_id UUID NOT NULL REFERENCES sarl_puc_batches(id) ON DELETE CASCADE,
    source_module VARCHAR(30) NOT NULL DEFAULT 'MODULO_1_PUC',
    flow_type VARCHAR(30) NOT NULL CHECK (flow_type IN ('ACTIVO_LIQUIDO', 'ENTRADA', 'SALIDA_CONTRACTUAL', 'SALIDA_ESTIMADA')),
    concept_code VARCHAR(50) NOT NULL,
    base_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_1_1_15 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_2_16_30 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_3_31_60 DECIMAL(19,4) NOT NULL DEFAULT 0,
    band_4_61_90 DECIMAL(19,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (period_id, concept_code)
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_sarl_puc_records_account_code ON sarl_puc_records(account_code);
CREATE INDEX IF NOT EXISTS idx_sarl_puc_records_batch_id ON sarl_puc_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_sarl_irl_band_flows_period ON sarl_irl_band_flows(period_id, source_module);