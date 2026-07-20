/* ============================================================
   PLANTEL · Cliente de la API (Neon Postgres vía /api)

   Cuentas reales (registro con tu correo): todo se guarda en la
   base de datos, aislado por usuario.

   Cuenta DEMOSTRACIÓN (admin@plantel.cl): pensada para el
   portafolio. NUNCA toca la base compartida: carga la semilla de
   ejemplo y guarda los cambios SOLO en este navegador, para que
   nadie pueda dejar contenido indebido a la vista de otros. Se
   puede reiniciar con el botón del aviso "modo demostración".
   ============================================================ */

const API = (() => {
  const TOKEN_KEY = "plantel_token";

  /* Marca especial: si el token guardado es esta, estamos en la
     cuenta demo y todo ocurre en el navegador. */
  const DEMO_TOKEN = "demo-local";
  const DEMO_EMAIL = "admin@plantel.cl";
  const DEMO_PASS = "1234";
  const DEMO_STATE_KEY = "plantel_demo_state";
  const DEMO_USER = { nombre: "Administrador (demo)", email: DEMO_EMAIL };

  let token = localStorage.getItem(TOKEN_KEY);
  let demo = token === DEMO_TOKEN;

  /* ---------- Estado demo (solo en este navegador) ---------- */
  function seedState() {
    const s = window.PLANTEL_DEMO_SEED || { contratos: [], trabajadores: [] };
    return {
      contratos: structuredClone(s.contratos),
      trabajadores: structuredClone(s.trabajadores)
    };
  }
  function loadDemoState() {
    try {
      const raw = localStorage.getItem(DEMO_STATE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.trabajadores) && Array.isArray(d.contratos)) return d;
      }
    } catch { /* datos corruptos: se regeneran desde la semilla */ }
    const s = seedState();
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(s));
    return s;
  }
  function saveDemoState(contratos, trabajadores) {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify({ contratos, trabajadores }));
  }
  function resetDemoState() {
    const s = seedState();
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(s));
    return s;
  }

  /* ---------- Aviso flotante "modo demostración" ---------- */
  function mostrarBannerDemo() {
    if (!demo || document.querySelector(".demo-banner")) return;
    if (!document.getElementById("demo-banner-css")) {
      const st = document.createElement("style");
      st.id = "demo-banner-css";
      st.textContent = `
        .demo-banner{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;
          display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);
          padding:9px 10px 9px 15px;border-radius:999px;
          background:#1d1916;color:#f4f0ea;font-size:13px;font-weight:500;
          box-shadow:0 12px 30px -10px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);}
        .demo-banner b{color:#f0a075;font-weight:700;}
        .demo-banner span{opacity:.85;}
        .demo-banner button{border:0;cursor:pointer;border-radius:999px;padding:7px 14px;
          font:inherit;font-weight:600;background:#c2410c;color:#fff;white-space:nowrap;
          transition:background .18s cubic-bezier(.23,1,.32,1),transform .15s cubic-bezier(.23,1,.32,1);}
        .demo-banner button:hover{background:#9a3412;}
        .demo-banner button:active{transform:scale(.96);}
        @media (max-width:560px){.demo-banner{font-size:12px;padding:8px 8px 8px 12px;}
          .demo-banner span{display:none;}}
      `;
      document.head.appendChild(st);
    }
    const b = document.createElement("div");
    b.className = "demo-banner";
    b.innerHTML = `<span>🔎</span><span><b>MODO DEMO</b> · los cambios se guardan solo en este navegador</span>` +
      `<button type="button" data-demo-reset>↺ Reiniciar datos</button>`;
    document.body.appendChild(b);
    b.querySelector("[data-demo-reset]").addEventListener("click", () => {
      resetDemoState();
      location.reload();
    });
  }
  if (document.readyState !== "loading") mostrarBannerDemo();
  else document.addEventListener("DOMContentLoaded", mostrarBannerDemo);

  /* ---------- Llamada real a la API (cuentas reales) ---------- */
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
    get isDemo() { return demo; },
    setToken(t) {
      token = t;
      demo = t === DEMO_TOKEN;
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
      if (demo) mostrarBannerDemo();
    },
    signup: (nombre, email, pass) => req("signup", { method: "POST", body: { nombre, email, pass } }),
    async signin(email, pass) {
      // La cuenta demo se valida y opera en el navegador: nunca llega al servidor.
      if (String(email).trim().toLowerCase() === DEMO_EMAIL) {
        if (pass !== DEMO_PASS) throw Object.assign(new Error("Contraseña incorrecta"), { status: 401 });
        return { token: DEMO_TOKEN, user: DEMO_USER };
      }
      return req("signin", { method: "POST", body: { email, pass } });
    },
    async loadState() {
      if (demo) return { user: DEMO_USER, ...loadDemoState() };
      return req("state");
    },
    async saveState(contratos, trabajadores) {
      if (demo) { saveDemoState(contratos, trabajadores); return { ok: true }; }
      return req("state", { method: "PUT", body: { contratos, trabajadores } });
    },
    async reset() {
      if (demo) return resetDemoState();
      return req("reset", { method: "POST" });
    }
  };
})();
