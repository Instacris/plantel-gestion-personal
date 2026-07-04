import { sql } from "./_lib/db.js";
import { readJson, send } from "./_lib/http.js";
import { getUser } from "./_lib/auth.js";
import { loadState, replaceStateQueries } from "./_lib/store.js";

export default async function handler(req, res) {
  const user = getUser(req);
  if (!user) return send(res, 401, { error: "Sesión expirada, inicia sesión de nuevo" });
  try {
    if (req.method === "GET") {
      const state = await loadState(user.uid);
      return send(res, 200, { user: { nombre: user.nombre, email: user.email }, ...state });
    }
    if (req.method === "PUT") {
      const body = await readJson(req);
      await sql.transaction(replaceStateQueries(user.uid, body.contratos, body.trabajadores));
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "Método no permitido" });
  } catch (e) {
    if (e.status === 400) return send(res, 400, { error: e.message });
    console.error("state:", e);
    return send(res, 500, { error: "Error del servidor" });
  }
}
