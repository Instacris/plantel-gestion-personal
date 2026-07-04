# Plantel · Gestión de Personal

Plataforma de administración de personal: trabajadores, horarios, asistencia, horas extras, contratos y nómina.

**Demo:** `admin@plantel.cl` · `1234`

## Stack

- **Frontend:** HTML + CSS + JavaScript vanilla (sin frameworks)
- **Backend:** Funciones serverless de Node.js en `/api` (compatibles con Vercel)
- **Base de datos:** PostgreSQL en [Neon](https://neon.tech) (una cuenta y datos independientes por usuario)
- **Autenticación:** JWT + contraseñas con hash bcrypt

## Desarrollo local

```bash
npm install
npm run db:setup   # crea tablas y cuenta demo en Neon (solo la primera vez)
npm run dev        # http://localhost:3000
```

Requiere un archivo `.env` con:

```
DATABASE_URL=postgresql://…   # cadena de conexión de Neon
JWT_SECRET=…                  # cadena aleatoria larga
```

## Despliegue en Vercel

1. `npx vercel login`
2. `npx vercel --prod`
3. En el panel de Vercel → Settings → Environment Variables, agregar `DATABASE_URL` y `JWT_SECRET` (mismos valores del `.env`) y volver a desplegar.

## API

| Método | Ruta          | Descripción                                    |
| ------ | ------------- | ---------------------------------------------- |
| POST   | `/api/signup` | Crea una cuenta (se inicializa con datos demo) |
| POST   | `/api/signin` | Inicia sesión, devuelve JWT                    |
| GET    | `/api/state`  | Carga contratos y trabajadores del usuario     |
| PUT    | `/api/state`  | Guarda el estado del usuario                   |
| POST   | `/api/reset`  | Restaura los datos de ejemplo                  |
