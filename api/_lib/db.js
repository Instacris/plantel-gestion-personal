import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está configurada (revisa las variables de entorno)");
}

export const sql = neon(process.env.DATABASE_URL);
