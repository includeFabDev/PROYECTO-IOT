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

function applyClimateRules(currentState, actuators, dtSeconds, timeScale) {
  const state = { ...(currentState || {}) };

  const luz = !!actuators.luz;
  const aire = !!actuators.aire;
  const riego = !!actuators.riego;

  const horaVirtual = typeof state.horaVirtual === 'string' ? state.horaVirtual : '12:00';
  const solarFactor = computeSolarFactorFromHora(horaVirtual);

  // 1) Temperatura base por hora
  const TEMP_MIN = 14;
  const TEMP_MAX = 38;
  let tempTarget = TEMP_MIN + (TEMP_MAX - TEMP_MIN) * solarFactor;

  // 2) Correcciones por actuadores
  if (aire) tempTarget -= 2.5;
  if (luz) tempTarget += 0.5;

  // 3) Humedad base por hora (inversa del sol)
  const HUM_MAX = 85;
  const HUM_MIN = 45;
  let humTarget = HUM_MAX - (HUM_MAX - HUM_MIN) * solarFactor;

  if (riego) humTarget += 8;
  if (aire) humTarget -= 1.5;

  // 4) Acercamiento incremental al target, escalado por dtSeconds + timeScale
  //    para que el cambio sea proporcional al tiempo real pasado, no constante
  //    por tick. Sin esto, un cron de 1min y un ping de 5s darían el mismo
  //    delta de temperatura.
  const prevTemp = typeof state.temperatura_c === 'number' ? state.temperatura_c : 27;
  const prevHum = typeof state.humedad_pct === 'number' ? state.humedad_pct : 68;

  // alpha: factor de "tasa" (1/seg). Multiplicado por dtSeconds da la fracción
  // de la diferencia a cubrir en este tick. A más timeScale, alpha sube (cubre
  // más rápido), pero se clampea para que en x10 el cambio sea visible sin
  // saltos bruscos.
  const baseRate = 0.05;             // 5% de la brecha por segundo en x1
  const alpha = Math.min(0.6, baseRate * timeScale * dtSeconds);
  let temp = prevTemp + (tempTarget - prevTemp) * alpha;
  let hum = prevHum + (humTarget - prevHum) * alpha;

  // 5) DRIFT DINÁMICO afectado por los actuadores, escalado por timeScale
  //    y por dtSeconds (para que sea proporcional al tiempo real, no por tick).
  //
  // - Calor se acumula con el tiempo (drift positivo).
  // - El ventilador (aire) enfría: REVIERTE el drift de temperatura.
  // - El suelo se seca con el tiempo (drift negativo de humedad).
  // - El riego (riego) hidrata: REVIERTE el drift de humedad.
  //
  // Tasas base (por segundo en x1):
  //   0.5 °C/seg subiría demasiado; usamos 0.05 °C/seg (3°C/min) que a x10
  //   se nota en segundos (0.5 °C/seg = 1.5°C en 3s).
  const TEMP_DRIFT_PER_SEC = 0.05;   // °C/seg (x1) sin ventilador
  const HUM_DRIFT_PER_SEC = 0.08;    // %/seg (x1) sin riego

  // Tiempo "virtual" de este tick, escalado por timeScale. dtSeconds*ts es la
  // cantidad de tiempo simulado que este tick representa.
  const virtualDt = dtSeconds * timeScale;

  // Temperatura: aire ON => invierte (enfría), aire OFF => calor acumulado.
  const tempDriftEffect = TEMP_DRIFT_PER_SEC * virtualDt * (aire ? -1 : 1);

  // Humedad: riego ON => invierte (sube), riego OFF => suelo se seca.
  const humDriftEffect = HUM_DRIFT_PER_SEC * virtualDt * (riego ? -1 : 1);

  temp += tempDriftEffect;
  hum += humDriftEffect;

  // LÍMITES LÓGICOS (Clamp) para que no rompa la escala del invernadero
  state.temperatura_c = Math.max(14, Math.min(45, temp));
  state.humedad_pct = Math.max(20, Math.min(95, hum));

  return state;
}


// Cron tick: por simplicidad actualiza todos los device_states (o solo uno si prefieres)
export default async function handler(req, res) {
  try {
    // 🔒 ID unificado del proyecto. Ignoramos cualquier chatId dinámico que venga
    // por query string: el sistema completo (frontend, bot de Telegram y cron)
    // opera sobre un único registro fijo en Supabase.
    const FIXED_CHAT_ID = '123456789';

    // Throttle: si el último tick fue hace menos de esto, no hacemos nada.
    // Evita que el cron automático de Vercel (cada 1 min) y los pings del
    // frontend (cada 5s) peleen entre sí.
    const MIN_DT_MS = 4000;
    const MIN_DT_SEC = MIN_DT_MS / 1000;
    // Si pasan más de 2 minutos entre ticks (cron atascado, app cerrada, etc.),
    // clampeamos para que un solo tick no salte la simulación 2h adelante.
    const MAX_DT_SEC = 120;

    const supabase = getSupabaseClient();

    // Leemos el registro fijo incluyendo updated_at para calcular el dt real.
    const { data, error } = await supabase
      .from('device_states')
      .select('chat_id, state, last_action, updated_at')
      .eq('chat_id', FIXED_CHAT_ID)
      .maybeSingle();

    if (error) throw error;

    let row = data;

    if (!row) {
      // Si por algún motivo el registro fijo aún no existe, lo creamos al vuelo
      // con el estado por defecto. Esto evita que el cron devuelva "updated: 0"
      // y garantiza que la primera ejecución del proyecto ya tenga su fila.
      const seeded = await ensureDeviceState(supabase, FIXED_CHAT_ID);
      row = seeded;
      if (!row) {
        return res.status(200).json({ ok: true, updated: 0, note: 'No device_states found' });
      }
    }

    // Calculamos cuánto tiempo real pasó desde el último tick. Si updated_at
    // viene nulo (registro recién creado) asumimos 1 tick "largo" (10s) para
    // que el primer ciclo tenga efecto visible.
    let dtSeconds = 10;
    if (row.updated_at) {
      const last = new Date(row.updated_at).getTime();
      const now = Date.now();
      dtSeconds = Math.max(MIN_DT_SEC, Math.min(MAX_DT_SEC, (now - last) / 1000));
    }

    // Si el último tick fue hace menos de MIN_DT_MS, devolvemos skipped sin
    // escribir en la BD. El frontend o Vercel volverá a llamar más tarde.
    if (row.updated_at) {
      const last = new Date(row.updated_at).getTime();
      const elapsed = Date.now() - last;
      if (elapsed < MIN_DT_MS) {
        return res.status(200).json({
          ok: true,
          updated: 0,
          skipped: true,
          elapsedMs: elapsed,
          note: 'Throttled: el último tick es muy reciente'
        });
      }
    }

    const chatId = row.chat_id;
    const state = { ...(row.state || {}) };

    // Hora virtual (fuente de verdad = cron)
    // Retrocompatibilidad:
    // - si no existe usarHoraReal => true
    // - si no existe timeScale => 1
    const usarHoraReal = state.usarHoraReal !== false;
    const timeScale = typeof state.timeScale === 'number' && !Number.isNaN(state.timeScale) && state.timeScale > 0
      ? state.timeScale
      : 1;

    if (usarHoraReal) {
      // Hora real (del servidor)
      const now = new Date();
      state.horaVirtual = toHHMM(now.getHours(), now.getMinutes());
    } else {
      // Avanza horaVirtual proporcional al tiempo real pasado × timeScale.
      // Antes avanzaba "1 minuto fijo por tick", lo que se desincronizaba
      // con la cadencia real (1 min vs 5s).
      const { hh, mm } = parseHHMM(state.horaVirtual);
      const totalMinutes = hh * 60 + mm;
      // "1s real = 1 min simulado" como convención original; timeScale
      // multiplica cuántos minutos virtuales corren por segundo real.
      const minutesToAdd = dtSeconds * 1 * timeScale;
      state.horaVirtual = minutesToHHMM(totalMinutes + minutesToAdd);
    }

    // actuadores
    const actuators = {
      luz: !!state.luz,
      aire: !!state.aire,
      riego: !!state.riego
    };

    // Si modoAutomatico está activo, aplicar reglas de clima
    const modoAutomatico = state.modoAutomatico !== false;
    if (modoAutomatico) {
      const nextState = applyClimateRules(state, actuators, dtSeconds, timeScale);
      // Asegurar que el reloj no se pierda tras aplicar reglas
      if (typeof state.horaVirtual === 'string') nextState.horaVirtual = state.horaVirtual;

      await saveDeviceState(supabase, chatId, nextState, 'tick_clima');
      return res.status(200).json({
        ok: true,
        updated: 1,
        dtSeconds: Math.round(dtSeconds * 10) / 10,
        timeScale,
        temperatura_c: nextState.temperatura_c,
        humedad_pct: nextState.humedad_pct
      });
    }

    // Modo manual: solo reloj, mantenemos temp/hum tal cual.
    await saveDeviceState(supabase, chatId, state, 'tick_reloj');
    return res.status(200).json({
      ok: true,
      updated: 1,
      dtSeconds: Math.round(dtSeconds * 10) / 10,
      mode: 'manual'
    });
  } catch (err) {
    console.error('[cron/invernadero] error:', err);
    return res.status(500).json({ error: 'Cron tick error' });
  }
}

