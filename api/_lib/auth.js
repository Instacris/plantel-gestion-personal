import jwt from "jsonwebtoken";

function secret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET no está configurada");
  return process.env.JWT_SECRET;
}

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, nombre: user.nombre },
    secret(),
    { expiresIn: "30d" }
  );
}

/* Devuelve el payload del token ({ uid, email, nombre }) o null si no hay sesión válida */
export function getUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers["authorization"] || "");
  if (!m) return null;
  try { return jwt.verify(m[1], secret()); } catch { return null; }
}
