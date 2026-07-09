import { parseKeywordsToAction } from '../services/interpreterKeywords.js';
import { executeAction, toggleDevice } from '../services/executeAction.js';
import { ensureDeviceState } from '../services/deviceStates.js';
import { env } from '../config/env.js';

function extractTelegramTextAndChatId(body) {
  const msg = body.message || body.callback_query?.message;
  const callbackQuery = body.callback_query;

  let chatId = null;
  let text = null;

  if (msg?.chat?.id) chatId = msg.chat.id;
  if (msg?.text) text = msg.text;

  if (!text && callbackQuery?.data) {
    // En esta fase: usaremos toggle según callback_data
    text = callbackQuery.data;
  }

  return { chatId, text };
}

async function sendTelegramMessage(chatId, messageText) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado (env.TELEGRAM_BOT_TOKEN vacío).');
    return;
  }

  // IMPORTANTE: template string con comillas invertidas
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = { chat_id: chatId, text: messageText };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Log para depuración en Vercel (token/chat_id inválidos se verán aquí)
  try {
    const result = await response.json();
    console.log('[Telegram sendMessage result]', { ok: result?.ok, description: result?.description });
  } catch (e) {
    console.warn('[Telegram sendMessage] no JSON en respuesta');
  }

  if (!response.ok) {
    console.warn('[Telegram sendMessage] HTTP error', response.status);
  }
}


function toFriendlyConfirmation(actionObj, currentState) {
  if (!actionObj) return null;
  const { action, device } = actionObj;
  const on = action === 'turn_on';

  const luz = !!currentState?.luz;
  const aire = !!currentState?.aire;
  const riego = !!currentState?.riego;

  if (device === 'luz') return (on ? luz : !luz) ? '💡 Luz encendida correctamente.' : '💡 Luz apagada correctamente.';
  if (device === 'aire') return (on ? aire : !aire) ? '🌬️ Ventilación encendida correctamente.' : '🌬️ Ventilación apagada correctamente.';
  if (device === 'riego') return (on ? riego : !riego) ? '🌱 Sistema de riego activado correctamente.' : '🌱 Sistema de riego detenido correctamente.';

  return null;
}

function extractQueryType(text) {
  const t = (text || '').toLowerCase().trim();

  // Temperatura
  if (/\b(temperatura|temp)\b/.test(t)) return 'temperature';

  // Humedad
  if (/\b(humedad|hum)\b/.test(t)) return 'humidity';

  // Estado (global)
  if (/\b(estado|status|que\s+hay|como\s+va|como\s+est[aá]a)\b/.test(t)) return 'status';

  // Hora
  if (/\b(hora|hora\s+virtual|reloj)\b/.test(t)) return 'time';

  // Modo automático
  if (/\b(automatico|autom[aá]tico|modo\s*auto|auto\b|automatic)\b/.test(t)) return 'auto_mode';

  return null;
}

function toFriendlyQueryResponse(queryType, current) {
  const state = current?.state || {};
  const temperatura_c = current?.state?.temperatura_c;
  const humedad_pct = current?.state?.humedad_pct;
  const horaVirtual = current?.state?.horaVirtual;
  const modoAutomatico = current?.state?.modoAutomatico;

  if (queryType === 'temperature') {
    return `🌡️ Temperatura actual: ${typeof temperatura_c === 'number' ? `${temperatura_c.toFixed(0)}°C` : '--°C'}`;
  }

  if (queryType === 'humidity') {
    return `💧 Humedad actual: ${typeof humedad_pct === 'number' ? `${humedad_pct.toFixed(0)}%` : '--%'}`;
  }

  if (queryType === 'time') {
    return `🕒 Hora virtual: ${horaVirtual || '--:--'}`;
  }

  if (queryType === 'auto_mode') {
    return `🤖 Modo automático: ${modoAutomatico ? 'Activado' : 'Desactivado'}`;
  }

  if (queryType === 'status') {
    return [
      '🌱 Estado del invernadero',
      `💡 Luz: ${state.luz ? 'Encendida' : 'Apagada'}`,
      `🌬️ Aire: ${state.aire ? 'Activado' : 'Apagado'}`,
      `🌱 Riego: ${state.riego ? 'Activado' : 'Detenido'}`,
      `🌡️ Temperatura: ${typeof temperatura_c === 'number' ? `${temperatura_c.toFixed(0)}°C` : '--°C'}`,
      `💦 Humedad: ${typeof humedad_pct === 'number' ? `${humedad_pct.toFixed(0)}%` : '--%'}`,
      `🕒 Hora: ${horaVirtual || '--:--'}`,
      `🤖 Modo automático: ${modoAutomatico ? 'Activado' : 'Desactivado'}`
    ].join('\n');
  }

  return null;
}


export function telegramWebhookRoute(supabase) {
  return async function telegramWebhookHandler(req, res) {
    try {
      const body = req.body || {};
      const { chatId, text } = extractTelegramTextAndChatId(body);

      if (!chatId) return res.status(200).json({ ok: true, ignored: true });

      // callbacks: toggle según el estado actual (esto corrige el problema del toggle fijo)
      if (text === 'luz_toggle') {
        await toggleDevice(supabase, 'luz', chatId);
        const current = await ensureDeviceState(supabase, chatId);
        const reply = toFriendlyConfirmation({ action: 'turn_on', device: 'luz' }, current.state) || '✅ Luz actualizada.';
        await sendTelegramMessage(chatId, reply);
        return res.json({ ok: true });
      }

      if (text === 'aire_toggle') {
        await toggleDevice(supabase, 'aire', chatId);
        const current = await ensureDeviceState(supabase, chatId);
        const reply = toFriendlyConfirmation({ action: 'turn_on', device: 'aire' }, current.state) || '✅ Ventilación actualizada.';
        await sendTelegramMessage(chatId, reply);
        return res.json({ ok: true });
      }

      // Primero: intentamos interpretar como acción
      const actionObj = parseKeywordsToAction(text || '');
      console.log('[Telegram] texto recibido:', text);
      console.log('[Telegram] actionObj:', actionObj);

      // Si NO es acción conocida, intentamos como consulta/estado
      if (!actionObj) {
        const queryType = extractQueryType(text);
        if (queryType) {
          const current = await ensureDeviceState(supabase, chatId);
          const reply = toFriendlyQueryResponse(queryType, current);
          await sendTelegramMessage(chatId, reply || 'No tengo ese dato ahora.');
          return res.json({ ok: true });
        }

        // Control avanzado por comandos “poner/activ ar” (Fase 2.3 mínima)
        const t = (text || '').toLowerCase().trim();

        // poner temperatura <num>
        // temp <num> / temperatura <num> (simple, sin regex inválidas)
        const mTemp = t.match(/\btemperatura\s*(?:a|=|:)?\s*(\d{1,2})\b/i) || t.match(/\btemp\s*(?:a|=|:)?\s*(\d{1,2})\b/i);


        if (mTemp) {
          const val = Number(mTemp[1]);
          if (!Number.isNaN(val)) {
            const current = await ensureDeviceState(supabase, chatId);
            const next = { ...(current.state || {}) };
            next.temperatura_c = Math.max(0, Math.min(60, val));
            // mantenemos reglas demo: si temp sube mucho, aire se enciende
            if (next.temperatura_c >= 32) next.aire = true;
            if (next.temperatura_c <= 30) next.aire = false;
            const lastAction = 'set_temperatura_c';
            // usamos executeAction para persistir vía saveDeviceState
            await executeAction(supabase, { action: next.temperatura_c >= (current.state?.temperatura_c ?? 27) ? 'turn_on' : 'turn_off', device: 'temperatura_c' }, chatId);
            const updated = await ensureDeviceState(supabase, chatId);
            await sendTelegramMessage(chatId, `🌡️ Temperatura ajustada a ${updated?.state?.temperatura_c ?? val}°C.`);
            return res.json({ ok: true });
          }
        }

        // poner humedad <num>
        const mHum = t.match(/humedad\s*(?:a|=|:)?\s*(\d{1,2})\b/i) || t.match(/hum\s*(?:a|=|:)?\s*(\d{1,2})\b/i);

        if (mHum) {
          const val = Number(mHum[1]);
          if (!Number.isNaN(val)) {
            await executeAction(supabase, { action: 'turn_on', device: 'humedad_pct' }, chatId);
            await sendTelegramMessage(chatId, `💧 Humedad objetivo recibido: ${val}%. (Demo ajusta con modo seco/riego).`);
            return res.json({ ok: true });
          }
        }

        // poner hora <HH:MM>
        const mTime = t.match(/hora\s*(?:a|=|:)?\s*(\d{1,2})\s*[:h]\s*(\d{2})/i) || t.match(/reloj\s*(?:a|=|:)?\s*(\d{1,2})\s*[:h]\s*(\d{2})/i);
        if (mTime) {
          const hh = Number(mTime[1]);
          const mm = Number(mTime[2]);
          if (!Number.isNaN(hh) && !Number.isNaN(mm) && hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
            const current = await ensureDeviceState(supabase, chatId);
            const state = { ...(current.state || {}) };
            state.horaVirtual = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            await (await import('../services/deviceStates.js')).saveDeviceState(supabase, chatId, state, 'set_horaVirtual');
            await sendTelegramMessage(chatId, `🕒 Hora virtual ajustada a ${state.horaVirtual}.`);
            return res.json({ ok: true });
          }
        }

        await sendTelegramMessage(chatId, 'No entendí el comando. Prueba: temperatura / humedad / estado / hora / modo automático.');
        return res.json({ ok: true, ignored: true });
      }


      // Es acción: ejecuta y confirma leyendo estado real
      await executeAction(supabase, actionObj, chatId);
      const current = await ensureDeviceState(supabase, chatId);

      const reply = toFriendlyConfirmation(actionObj, current.state) || '✅ Orden ejecutada.';
      await sendTelegramMessage(chatId, reply);

      return res.json({ ok: true });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error en webhook' });
    }
  };
}


