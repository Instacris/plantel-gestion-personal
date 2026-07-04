import { sql } from "./_lib/db.js";
import { send } from "./_lib/http.js";
import { getUser } from "./_lib/auth.js";
import { seedQueries, seedState } from "./_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  const user = getUser(req);
  if (!user) return send(res, 401, { error: "Sesión expirada, inicia sesión de nuevo" });
  try {
    await sql.transaction(seedQueries(user.uid));
    return send(res, 200, seedState());
  } catch (e) {
    console.error("reset:", e);
    return send(res, 500, { error: "Error del servidor" });
  }
}
