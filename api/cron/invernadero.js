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
function computeSolarFactorFromHora(hhmm) {
  // Factor 0..1 con pico alrededor de 13:00 (misma idea de la simulación frontend)
  const { hh, mm } = parseHHMM(hhmm);
  const minutes = hh * 60 + mm;

  const dayMinutes = 24 * 60;
  const peak = 13 * 60;
  const halfWindow = 6 * 60; // ~7:00..19:00

  const dist = Math.abs(minutes - peak);
  const distWrap = Math.min(dist, dayMinutes - dist);
  if (distWrap >= halfWindow) return 0;

  const t = 1 - (distWrap / halfWindow); // 0..1
  return Math.max(0, Math.min(1, Math.sin((Math.PI / 2) * t)));
}

function applyClimateRules(currentState, actuators) {
  const state = { ...(currentState || {}) };

  const luz = !!actuators.luz;
  const aire = !!actuators.aire;
  const riego = !!actuators.riego;

  const horaVirtual = typeof state.horaVirtual === 'string' ? state.horaVirtual : (state.horaVirtual || state.horaVirtual);
  const solarFactor = computeSolarFactorFromHora(horaVirtual);

  // 1) Temperatura base por hora
  // Elegimos el mismo rango aproximado del frontend sim
  const TEMP_MIN = 14;
  const TEMP_MAX = 38;
  let tempTarget = TEMP_MIN + (TEMP_MAX - TEMP_MIN) * solarFactor;

  // 2) Correcciones por actuadores (estado del invernadero)
  // Aire enfría, riego/humedad afecta ligeramente, luz fuera de “solar” aporta poco
  if (aire) tempTarget -= 2.5;
  if (luz) tempTarget += 0.5; // aunque el sol ya existe, luz suma un poco

  // 3) Humedad base por hora (inversa del sol)
  const HUM_MAX = 85;
  const HUM_MIN = 45;
  let humTarget = HUM_MAX - (HUM_MAX - HUM_MIN) * solarFactor;

  if (riego) humTarget += 8;
  if (aire) humTarget -= 1.5; // aire tiende a bajar algo humedad

  // 4) Para que sea “suave”, hacemos acercamiento incremental vs set directo
  const prevTemp = typeof state.temperatura_c === 'number' ? state.temperatura_c : 27;
  const prevHum = typeof state.humedad_pct === 'number' ? state.humedad_pct : 68;

  const alpha = 0.35; // 0..1, cuánto se acerca en 1 minuto
  const temp = prevTemp + (tempTarget - prevTemp) * alpha;
  const hum = prevHum + (humTarget - prevHum) * alpha;

  // clamp
  state.temperatura_c = Math.max(0, Math.min(60, temp));
  state.humedad_pct = Math.max(0, Math.min(100, hum));

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

      // Hora REAL (del servidor). Así el frontend/estado se sincroniza con el minuto actual.
      const now = new Date();
      const hh = now.getHours();
      const mm = now.getMinutes();
      state.horaVirtual = toHHMM(hh, mm);


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

