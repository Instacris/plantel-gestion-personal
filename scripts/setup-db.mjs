/* Crea el esquema en Neon Postgres y deja lista la cuenta demo.
   Uso: npm run db:setup  (lee DATABASE_URL desde .env) */
import bcrypt from "bcryptjs";
import { sql } from "../api/_lib/db.js";
import { seedQueries } from "../api/_lib/store.js";

console.log("Creando tablas…");

await sql`CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

await sql`CREATE TABLE IF NOT EXISTS contratos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  nombre TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  sueldo_base INTEGER NOT NULL DEFAULT 0,
  factor_extra DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  jornada_semanal DOUBLE PRECISION NOT NULL DEFAULT 44,
  turno_defecto TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (usuario_id, id)
)`;

await sql`CREATE TABLE IF NOT EXISTS trabajadores (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  nombre TEXT NOT NULL DEFAULT '',
  rut TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  rol TEXT NOT NULL DEFAULT 'Empleado',
  contrato_id TEXT,
  turno TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'Activo',
  color TEXT NOT NULL DEFAULT '#6366f1',
  ingreso TEXT NOT NULL DEFAULT '',
  sueldo_base INTEGER NOT NULL DEFAULT 0,
  valor_hora_extra INTEGER NOT NULL DEFAULT 0,
  horas_extras_mes DOUBLE PRECISION NOT NULL DEFAULT 0,
  horario JSONB NOT NULL DEFAULT '{}',
  asistencia JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (usuario_id, id)
)`;

console.log("Tablas listas. Creando cuenta demo (admin@plantel.cl / 1234)…");

const hash = await bcrypt.hash("1234", 10);
const rows = await sql`
  INSERT INTO usuarios (nombre, email, pass_hash)
  VALUES ('Cristóbal C.', 'admin@plantel.cl', ${hash})
  ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
  RETURNING id`;

await sql.transaction(seedQueries(rows[0].id));

const [[u], [c], [t]] = await sql.transaction([
  sql`SELECT count(*)::int AS n FROM usuarios`,
  sql`SELECT count(*)::int AS n FROM contratos`,
  sql`SELECT count(*)::int AS n FROM trabajadores`
]);
console.log(`Listo ✔  usuarios: ${u.n} · contratos: ${c.n} · trabajadores: ${t.n}`);
