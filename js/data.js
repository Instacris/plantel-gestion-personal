/* ============================================================
   PLANTEL · Constantes y utilidades de datos
   (los datos viven en Neon Postgres y se acceden vía js/api.js;
    las semillas de ejemplo están en el servidor: api/_lib/seed.js)
   ============================================================ */

/* Periodo de trabajo = mes actual (hoy) */
const NOW = new Date();
const PERIODO = { y: NOW.getFullYear(), m: NOW.getMonth() }; // m: 0=Ene

/* Feriados del periodo (Chile, ejemplo) — clave YYYY-MM-DD */
const FERIADOS = ["2026-06-20", "2026-06-29", "2026-07-16", "2026-09-18", "2026-09-19"];

const CARGOS = [
  "Gerente de Operaciones", "Jefa de Turno", "Jefe de Turno", "Supervisor", "Supervisora de Sala",
  "Cajero", "Cajera", "Vendedor", "Vendedora", "Bodeguero", "Guardia de Seguridad",
  "Recepcionista", "Personal de Aseo", "Reponedor", "Analista de RR.HH."
];
const ROLES = ["Administrador", "Supervisor", "Empleado"];
const TURNOS = ["Mañana", "Tarde", "Noche", "Rotativo", "Flexible"];
const ESTADOS = ["Activo", "Inactivo", "Vacaciones", "Licencia"];
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/* ---- Utilidades de fecha ---- */
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const weekdayOf = (y, m, d) => ((new Date(y, m, d).getDay() + 6) % 7) + 1; // 1=Lun..7=Dom

/* Asegura que un trabajador tenga todos los campos del modelo nuevo */
function normalizeWorker(t) {
  if (!t.horario) {
    t.horario = {};
    const dias = t.dias || [1, 2, 3, 4, 5];
    for (let d = 1; d <= 7; d++) {
      t.horario[d] = dias.includes(d) ? { on: true, in: t.entrada || "08:00", out: t.salida || "17:00" } : { on: false, in: "", out: "" };
    }
  }
  if (t.valorHoraExtra == null) t.valorHoraExtra = Math.round((t.sueldoBase || 0) / 180 * 1.5 / 100) * 100;
  if (t.horasExtrasMes == null) t.horasExtrasMes = t.horasExtras || 0;
  if (!t.asistencia) t.asistencia = {};
  delete t.dias; delete t.entrada; delete t.salida; delete t.diasLaborales; delete t.diasAsistidos; delete t.horasExtras;
  return t;
}
