import bcrypt from "bcryptjs";
import { sql } from "./_lib/db.js";
import { readJson, send } from "./_lib/http.js";
import { signToken } from "./_lib/auth.js";
import { seedQueries } from "./_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  try {
    const body = await readJson(req);
    const nombre = String(body.nombre || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
    const pass = String(body.pass || "");
    if (!nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "Completa nombre y un correo válido" });
    if (pass.length < 4) return send(res, 400, { error: "La contraseña debe tener al menos 4 caracteres" });

    const hash = await bcrypt.hash(pass, 10);
    let rows;
    try {
      rows = await sql`INSERT INTO usuarios (nombre, email, pass_hash) VALUES (${nombre}, ${email}, ${hash}) RETURNING id, nombre, email`;
    } catch (e) {
      if (e.code === "23505" || /usuarios_email/.test(String(e.message))) {
        return send(res, 409, { error: "Ese correo ya está registrado" });
      }
      throw e;
    }
    const user = rows[0];
    await sql.transaction(seedQueries(user.id));
    return send(res, 200, { token: signToken(user), user: { nombre: user.nombre, email: user.email } });
  } catch (e) {
    console.error("signup:", e);
    return send(res, 500, { error: "Error del servidor" });
  }
}
