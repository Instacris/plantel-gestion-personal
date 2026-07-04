/* ============================================================
   PLANTEL · Cliente de la API (Neon Postgres vía /api)
   ============================================================ */

const API = (() => {
  const TOKEN_KEY = "plantel_token";
  let token = localStorage.getItem(TOKEN_KEY);

  async function req(path, { method = "GET", body } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = "Bearer " + token;
    let r;
    try {
      r = await fetch("/api/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error("Sin conexión con el servidor"), { status: 0 });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || "Error del servidor"), { status: r.status });
    return data;
  }

  return {
    get hasSession() { return !!token; },
    setToken(t) {
      token = t;
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    },
    signup: (nombre, email, pass) => req("signup", { method: "POST", body: { nombre, email, pass } }),
    signin: (email, pass) => req("signin", { method: "POST", body: { email, pass } }),
    loadState: () => req("state"),
    saveState: (contratos, trabajadores) => req("state", { method: "PUT", body: { contratos, trabajadores } }),
    reset: () => req("reset", { method: "POST" })
  };
})();
