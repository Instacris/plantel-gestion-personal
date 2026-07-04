import bcrypt from "bcryptjs";
import { sql } from "./_lib/db.js";
import { readJson, send } from "./_lib/http.js";
import { signToken } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  try {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const pass = String(body.pass || "");
    const rows = await sql`SELECT id, nombre, email, pass_hash FROM usuarios WHERE email = ${email}`;
    const user = rows[0];
    if (!user || !(await bcrypt.compare(pass, user.pass_hash))) {
      return send(res, 401, { error: "Correo o contraseña incorrectos" });
    }
    return send(res, 200, { token: signToken(user), user: { nombre: user.nombre, email: user.email } });
  } catch (e) {
    console.error("signin:", e);
    return send(res, 500, { error: "Error del servidor" });
  }
}
