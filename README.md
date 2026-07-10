# PROYECTO-IOT — Smart Home / Invernadero (Simulación + Telegram + Supabase)

Sistema IoT tipo **smart home / invernadero** con:
- **Panel interactivo en Telegram** (botones inline)
- **Persistencia de estado en Supabase**
- **Simulación automática (cron)** de clima y variables ambientales
- Backend desplegado en **Vercel** mediante endpoints HTTP

> Nota: El proyecto modela el sistema como una **simulación** (no control físico directo de hardware).

---

## Estructura del proyecto

- `backend_vercel/`
  - Backend Node.js/Express adaptado para Vercel (serverless)
  - Rutas:
    - `/api/state/:chatId`
    - `/api/action`
    - `/api/telegram-webhook`
  - Servicios:
    - Manejo de estado en Supabase
    - Ejecución de acciones (encender/apagar y simulación)
    - Lógica de parsing de keywords (opcional, vía `/api/action`)
  - Simulación con cron:
    - `cron/invernadero.js`

- `api/`
  - Puente mínimo para Vercel (enrutamiento hacia el backend)

- `frontend/`
  - Material relacionado con la maqueta / pruebas (no es el núcleo de los endpoints actuales)

---

## ¿Cómo funciona (a grandes rasgos)?

1. **Telegram** muestra un panel con botones dinámicos (luz, aire/ventilador, riego, escalas de simulación).
2. Cada botón dispara un **callback** hacia el endpoint `POST /api/telegram-webhook`.
3. El backend ejecuta la acción y actualiza el estado persistido en Supabase (`device_states`).
4. En modo automático, el cron `cron/invernadero.js` actualiza la temperatura y humedad con base en:
   - hora virtual (o hora real)
   - actuadores (luz, aire, riego)
   - `timeScale` (velocidad de simulación)
5. Después de cada acción, el bot **edita el mensaje** para mostrar el nuevo estado.

---

## Estado en Supabase

Tabla esperada: `device_states`

Campos usados por el backend:
- `chat_id` (clave única / conflicto)
- `state` (objeto JSON con flags y variables)
- `last_action` (texto con la última acción)
- `updated_at`

### Defaults
El sistema define un estado por defecto (ejemplo de valores):
- `luz`, `aire`, `riego`
- `temperatura_c`, `humedad_pct`
- `modoAutomatico` (por defecto true)
- Reloj: `usarHoraReal`, `horaVirtual`, `timeScale`

---

## Endpoints (backend en Vercel)

### 1) GET `/api/state/:chatId`
Devuelve el estado del sistema para el `chatId` indicado.

- Si el registro no existe, lo crea con defaults.
- Respuesta con:
  - `devices` (luz, aire, riego, temperatura, humedad, modoAutomatico, horaVirtual, usarHoraReal, timeScale)
  - `lastAction`
  - `updatedAt`

### 2) POST `/api/action`
Permite ejecutar acciones vía JSON.

**Casos soportados (según implementación actual):**

#### a) Control de reloj
- `{ "device": "time", "mode": "backend" }` -> `usarHoraReal = true`
- `{ "device": "time", "mode": "sim" }` -> `usarHoraReal = false`
- `{ "device": "time", "timeScale": <number> }` -> ajusta `timeScale`

#### b) Encender / apagar por device
- `{ "chatId": <number>, "device": "luz|aire|riego", "mode": "on|off" }`
  - internamente aplica `turn_on` / `turn_off`.

#### c) Toggle rápido
- `{ "chatId": <number>, "device": "luz|aire|temperatura_c|humedad_pct|riego" }`
  - sin `mode` => invierte el estado actual.

#### d) Texto libre (parser)
- `{ "chatId": <number>, "text": "enciende la luz" }`
  - convierte keywords a una `actionObj` y ejecuta la acción.

### 3) POST `/api/telegram-webhook`
Webhook principal de Telegram.

- Si llega `message` normal:
  - envía un mensaje de bienvenida + panel inline.
- Si llega `callback_query` (botones):
  - ejecuta acción según `callback_data`
  - responde la callback
  - vuelve a leer estado y edita el mensaje con el panel actualizado.

> Importante: el sistema usa un **ID fijo** para la simulación en el bot/cron (`dbChatId` / `FIXED_CHAT_ID = 123456789`), aunque Telegram tenga distintos `chatId`.

---

## Simulación automática (cron)

Archivo: `backend_vercel/src/cron/invernadero.js`

- Lee el registro fijo desde Supabase.
- Calcula `dtSeconds` (tiempo real entre ticks) con seguridad (clamp máximo).
- Si `modoAutomatico` está activo:
  - actualiza `horaVirtual` (real o simulada)
  - calcula objetivos por “sol”
  - ajusta temperatura y humedad gradualmente usando `timeScale`
  - aplica drift y reglas afectadas por `luz`, `aire`, `riego`
  - guarda el estado
- Si no está en automático:
  - mantiene temperatura/humedad y solo actualiza reloj.

---

## Requisitos

- Node.js (versión compatible con ES Modules / `type: module`)
- Cuenta y proyecto en **Supabase**
- Bot de **Telegram** con token
- Vercel (para deploy) y/o ejecución local

---

## Variables de entorno

En `backend_vercel/src/config/env.js` se requieren:
- `PORT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`

Crea un archivo `.env` en la raíz del proyecto (o configura según tu plataforma) con ejemplo:

```env
PORT=3000
SUPABASE_URL=TU_URL
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN=TU_TELEGRAM_BOT_TOKEN
```

---

## Instalación y ejecución (local)

### Backend

```bash
cd backend_vercel
npm install
npm run dev
```

---

## Deploy en Vercel

- El backend usa `api/` como puente hacia el handler serverless.
- Configura los endpoints en Vercel apuntando a los paths definidos en el código.
- Asegúrate de agregar variables de entorno en Vercel.

---

## Cómo probar (flujo rápido)

1. Iniciar el backend.
2. Configurar el webhook de Telegram apuntando a:
   - `POST /api/telegram-webhook`
3. En Telegram:
   - mandar un mensaje al bot
   - se debe mostrar el panel inline
4. Presionar botones:
   - el panel debe actualizarse y el estado debe cambiar en Supabase
5. Ver el cron:
   - si `modoAutomatico=true`, temperatura/humedad deben cambiar con el tiempo

---

## Resultados esperados (para el informe)

- Se logró una interfaz funcional con botones inline en Telegram para controlar variables del sistema.
- Se logró persistir y sincronizar el estado centralizado en Supabase (`device_states`).
- Se logró simular la evolución del invernadero con un cron basado en reloj virtual/real y controlada por `timeScale`.
- Se logró actualizar el panel en Telegram editando el mismo mensaje con el estado más reciente.

---

## Licencia

Sin licencia definida.

---

## Notas / limitaciones

- Es una **simulación**: no hay integración directa con hardware físico.
- El bot y el cron operan sobre un **registro fijo** (para la demo/maqueta). 
- Algunos componentes del proyecto podrían estar desactualizados (solo se documenta lo que está en uso actual según endpoints y servicios revisados).

