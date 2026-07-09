import { getSupabaseClient } from '../../backend_vercel/src/services/supabaseClient.js';
import { ensureDeviceState, saveDeviceState } from '../../backend_vercel/src/services/deviceStates.js';

function parseHHMM(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return { hh: 0, mm: 0 };
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hh: 0, mm: 0 };
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return { hh, mm };
}

function toHHMM(hh, mm) {
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function minutesToHHMM(totalMinutes) {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return toHHMM(hh, mm);
}

// Regla simple de clima (1 tick = 1 minuto virtual)
function applyClimateRules(currentState, actuators) {
  const state = { ...(currentState || {}) };

  const luz = !!actuators.luz;
  const aire = !!actuators.aire;
  const riego = !!actuators.riego;

  // temperaturas
  let temp = typeof state.temperatura_c === 'number' ? state.temperatura_c : 27;
  // humedad
  let hum = typeof state.humedad_pct === 'number' ? state.humedad_pct : 68;

  // Si hay luz -> sube; si no -> baja
  temp += luz ? 0.2 : -0.1;

  // Si aire activo -> enfría
  if (aire) temp += -0.5;

  // Humedad por riego
  hum += riego ? 2 : -0.2;

  // clamp
  temp = Math.max(0, Math.min(60, temp));
  hum = Math.max(0, Math.min(100, hum));

  state.temperatura_c = temp;
  state.humedad_pct = hum;

  return state;
}

// Cron tick: por simplicidad actualiza todos los device_states (o solo uno si prefieres)
export default async function handler(req, res) {
  try {
    // Identificador del chat para demo; si no viene, actualizamos todos los registros.
    const chatIdQuery = req?.query?.chatId;

    const supabase = getSupabaseClient();

    // Leer todos los device_states (o uno) con estado actual
    let rows = [];
    if (chatIdQuery) {
      const { data, error } = await supabase
        .from('device_states')
        .select('chat_id, state, last_action')
        .eq('chat_id', chatIdQuery)
        .maybeSingle();
      if (error) throw error;
      if (data) rows = [data];
    } else {
      const { data, error } = await supabase
        .from('device_states')
        .select('chat_id, state, last_action');
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
    }

    if (!rows.length) {
      return res.status(200).json({ ok: true, updated: 0, note: 'No device_states found' });
    }

    let updated = 0;

    for (const row of rows) {
      const chatId = row.chat_id;
      const current = await ensureDeviceState(supabase, chatId);
      const state = { ...(current.state || {}) };

      // Avanzar reloj SIEMPRE
      const { hh, mm } = parseHHMM(state.horaVirtual);
      const nextMinutes = hh * 60 + mm + 1;
      state.horaVirtual = minutesToHHMM(nextMinutes);

      // actuadores
      const actuators = {
        luz: !!state.luz,
        aire: !!state.aire,
        riego: !!state.riego
      };

      // Si modoAutomatico está activo, aplicar reglas de clima
      const modoAutomatico = state.modoAutomatico !== false;
      if (modoAutomatico) {
        const nextState = applyClimateRules(state, actuators);
        // también podríamos aplicar riego/aire automático en el futuro
        // por ahora solo ajustamos temperatura/humedad
        await saveDeviceState(supabase, chatId, nextState, 'tick_clima');
        updated++;
      } else {
        // modo manual: solo reloj (y mantenemos temp/hum)
        await saveDeviceState(supabase, chatId, state, 'tick_reloj');
        updated++;
      }
    }

    return res.status(200).json({ ok: true, updated });
  } catch (err) {
    console.error('[cron/invernadero] error:', err);
    return res.status(500).json({ error: 'Cron tick error' });
  }
}

