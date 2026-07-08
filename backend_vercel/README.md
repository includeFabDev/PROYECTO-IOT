# backend_vercel (Fase 1: sin IA)

Backend Node.js para webhook de Telegram y lectura/escritura de estado en Supabase.

## Requisitos
- Node.js 18+
- Supabase con tabla `device_states`.

## Variables de entorno
Crear un `.env` en esta carpeta:

```bash
SUPABASE_URL=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx
PORT=3000
```

> `SUPABASE_SERVICE_ROLE_KEY` es necesaria para escribir desde el backend.

## Estructura de tabla Supabase (mínima)
Tabla `device_states`:
- `chat_id` (bigint o text) UNIQUE/PK
- `state` (jsonb)  ej: {"luz": true, "aire": false}
- `last_action` (text)
- `updated_at` (timestamptz)

## Correr local
```bash
cd backend_vercel
npm install
npm run dev
```

## Endpoints
- `GET /api/state/:chatId`
- `POST /api/telegram-webhook` (en esta fase solo actualiza estado; luego se añadirá sendMessage)

