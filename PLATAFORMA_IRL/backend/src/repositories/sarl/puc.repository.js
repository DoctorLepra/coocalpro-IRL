const pool = require('../../config/db');

class PucRepository {
  // 1. Verifica si ya existe un cargue de PUC para ese periodo (Regla: No duplicar meses)
  static async existsPeriod(periodDate) {
    const query = `
      SELECT 1
      FROM sarl_puc_records
      WHERE period_date = $1
      LIMIT 1;
    `;
    const result = await pool.query(query, [periodDate]);
    return result.rowCount > 0;
  }

  // 2. Obtiene la suma mensual de 510500 y 511000 de los últimos 11 meses anteriores
  static async getHistoricalAdminExpenses(periodDate) {
    const query = `
      SELECT
        period_date,
        SUM(balance) AS "monthTotal"
      FROM sarl_puc_records
      WHERE account_code IN ('510500', '511000')
        AND period_date >= ($1::date - INTERVAL '11 months')
        AND period_date < $1::date
      GROUP BY period_date
      ORDER BY period_date ASC;
    `;
    const result = await pool.query(query, [periodDate]);
    return result.rows;
  }

  // 3. Guarda de forma atómica (ACID) las cuentas del PUC y los flujos de las 4 bandas
  static async savePeriodData(periodDate, cleanRecords, flows) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 3.1 Insertar cada cuenta contable del CSV en sarl_puc_records
      const insertRecordQuery = `
        INSERT INTO sarl_puc_records (period_date, account_code, account_name, balance)
        VALUES ($1, $2, $3, $4);
      `;

      for (const record of cleanRecords) {
        await client.query(insertRecordQuery, [
          periodDate,
          record.account_code,
          record.account_name,
          record.balance.toFixed(4),
        ]);
      }

      // 3.2 Insertar los 3 flujos calculados en sarl_irl_band_flows
      const insertFlowQuery = `
        INSERT INTO sarl_irl_band_flows (
          period_date, source_module, flow_type, concept_code,
          base_amount, band_1_1_15, band_2_16_30, band_3_31_60, band_4_61_90
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `;

      for (const flow of flows) {
        await client.query(insertFlowQuery, [
          periodDate,
          flow.source_module,
          flow.flow_type,
          flow.concept_code,
          flow.base_amount,
          flow.band_1_1_15,
          flow.band_2_16_30,
          flow.band_3_31_60,
          flow.band_4_61_90,
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 4. Elimina el cargue de un mes para permitir subir uno nuevo
  static async deleteByPeriod(periodDate) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'DELETE FROM sarl_irl_band_flows WHERE period_date = $1 AND source_module = $2;',
        [periodDate, 'PUC']
      );

      const deleteRecords = await client.query(
        'DELETE FROM sarl_puc_records WHERE period_date = $1;',
        [periodDate]
      );

      await client.query('COMMIT');
      return deleteRecords.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = PucRepository;