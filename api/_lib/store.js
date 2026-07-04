import { sql } from "./db.js";
import { SEED_CONTRATOS, SEED_TRABAJADORES } from "./seed.js";

/* Límites defensivos para el estado que envía el cliente */
const MAX_CONTRATOS = 200;
const MAX_TRABAJADORES = 5000;

const str = (v, max = 200) => String(v ?? "").slice(0, max);
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const int = (v) => Math.round(num(v));
const jsonb = (v) => JSON.stringify(v && typeof v === "object" ? v : {});

export async function loadState(uid) {
  const [contratos, trabajadores] = await sql.transaction([
    sql`SELECT id, nombre, tipo, color,
               sueldo_base     AS "sueldoBase",
               factor_extra    AS "factorExtra",
               jornada_semanal AS "jornadaSemanal",
               turno_defecto   AS "turnoDefecto",
               descripcion
          FROM contratos WHERE usuario_id = ${uid} ORDER BY pos`,
    sql`SELECT id, nombre, rut, cargo, rol,
               contrato_id      AS "contratoId",
               turno, estado, color, ingreso,
               sueldo_base      AS "sueldoBase",
               valor_hora_extra AS "valorHoraExtra",
               horas_extras_mes AS "horasExtrasMes",
               horario, asistencia
          FROM trabajadores WHERE usuario_id = ${uid} ORDER BY pos`
  ]);
  return { contratos, trabajadores };
}

/* Queries que reemplazan por completo el estado del usuario (se ejecutan en una transacción) */
export function replaceStateQueries(uid, contratos, trabajadores) {
  if (!Array.isArray(contratos) || !Array.isArray(trabajadores)) {
    throw Object.assign(new Error("Estado inválido"), { status: 400 });
  }
  if (contratos.length > MAX_CONTRATOS || trabajadores.length > MAX_TRABAJADORES) {
    throw Object.assign(new Error("Demasiados registros"), { status: 400 });
  }
  const qs = [
    sql`DELETE FROM trabajadores WHERE usuario_id = ${uid}`,
    sql`DELETE FROM contratos WHERE usuario_id = ${uid}`
  ];
  contratos.forEach((c, i) => qs.push(sql`
    INSERT INTO contratos (usuario_id, id, pos, nombre, tipo, color, sueldo_base, factor_extra, jornada_semanal, turno_defecto, descripcion)
    VALUES (${uid}, ${str(c.id, 60)}, ${i}, ${str(c.nombre)}, ${str(c.tipo)}, ${str(c.color, 30)},
            ${int(c.sueldoBase)}, ${num(c.factorExtra)}, ${num(c.jornadaSemanal)}, ${str(c.turnoDefecto, 40)}, ${str(c.descripcion, 500)})
  `));
  trabajadores.forEach((t, i) => qs.push(sql`
    INSERT INTO trabajadores (usuario_id, id, pos, nombre, rut, cargo, rol, contrato_id, turno, estado, color,
                              ingreso, sueldo_base, valor_hora_extra, horas_extras_mes, horario, asistencia)
    VALUES (${uid}, ${str(t.id, 60)}, ${i}, ${str(t.nombre)}, ${str(t.rut, 20)}, ${str(t.cargo)}, ${str(t.rol, 40)},
            ${str(t.contratoId, 60)}, ${str(t.turno, 40)}, ${str(t.estado, 40)}, ${str(t.color, 30)},
            ${str(t.ingreso, 10)}, ${int(t.sueldoBase)}, ${int(t.valorHoraExtra)}, ${num(t.horasExtrasMes)},
            ${jsonb(t.horario)}::jsonb, ${jsonb(t.asistencia)}::jsonb)
  `));
  return qs;
}

/* Estado inicial (datos de ejemplo) para cuentas nuevas o restablecidas */
export function seedQueries(uid) {
  return replaceStateQueries(uid, SEED_CONTRATOS, SEED_TRABAJADORES);
}

export function seedState() {
  return {
    contratos: JSON.parse(JSON.stringify(SEED_CONTRATOS)),
    trabajadores: JSON.parse(JSON.stringify(SEED_TRABAJADORES))
  };
}
