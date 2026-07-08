# TODO — PROYECTO IOT (Fase visual → Telegram webhook)

## Plan aprobado (Camino 1, Python fuera por ahora)

### Fase 2.2 — Terminar simulación 3D
- [ ] Validar que el extractor/ventilador refleja `devices.aire` desde `/api/state/:chatId`.
- [ ] Validar que la luz refleja `devices.luz` desde `/api/state/:chatId`.
- [ ] Ajustar indicadores visuales para que se entienda ON/OFF sin explicaciones.

### Fase 3 — Integrar Telegram real con Node (Webhook)
- [ ] Configurar BOT_TOKEN y la URL pública del webhook en Telegram.
- [ ] Asegurar que Telegram envía `message.text` o `callback_query.data` y que el parser actual (`parseKeywordsToAction`) detecta correctamente.
- [ ] Hacer que el frontend/escena use el mismo `CHAT_ID` que Telegram.
- [ ] Probar localmente con ngrok o similar para que el webhook funcione.

### Fase 4 — (Opcional) IA en el backend
- [ ] Mantener keywords simples como fallback.
- [ ] Agregar Ollama/Gemini para interpretar lenguaje natural → `{action, device}`.

---
Estado inicial: Backend + Supabase + estado + frontend 3D existen; falta conectar Telegram real (y quitar Python luego si aplica). 

