import { ensureDeviceState, saveDeviceState, getDefaultState } from './deviceStates.js';

function actionToLastActionTurnOn(device) {
  if (device === 'luz') return 'encender_luz';
  if (device === 'aire') return 'encender_aire';
  if (device === 'temperatura_c') return 'activar_calor';
  if (device === 'humedad_pct') return 'activar_sequedad';
  if (device === 'riego') return 'activar_riego';
  return 'accion_on';
}

function actionToLastActionTurnOff(device) {
  if (device === 'luz') return 'apagar_luz';
  if (device === 'aire') return 'apagar_aire';
  if (device === 'temperatura_c') return 'desactivar_calor';
  if (device === 'humedad_pct') return 'desactivar_sequedad';
  if (device === 'riego') return 'desactivar_riego';
  return 'accion_off';
}

function applySimulatedModeFromTemperature(state, deviceOn) {
  const NORMAL_TEMP = 27;
  const TOP_TEMP = 35;
  const STEP = 2;

  if (deviceOn) {
    state.modoCalor = true;
    state.temperatura_c = Math.min(TOP_TEMP, (state.temperatura_c ?? NORMAL_TEMP) + STEP);
  } else {
    state.modoCalor = false;
    state.temperatura_c = Math.max(NORMAL_TEMP, (state.temperatura_c ?? TOP_TEMP) - STEP);
  }
}

function applySimulatedModeFromHumidity(state, deviceOn) {
  const NORMAL_HUM = 68;
  const DRY_HUM = 40;
  const STEP = 6;

  if (deviceOn) {
    state.modoSeco = true;
    state.humedad_pct = Math.max(DRY_HUM, (state.humedad_pct ?? NORMAL_HUM) - STEP);
  } else {
    state.modoSeco = false;
    state.humedad_pct = Math.min(NORMAL_HUM, (state.humedad_pct ?? DRY_HUM) + STEP);
  }
}

function applySimulatedModeFromIrrigation(state, deviceOn) {
  const NORMAL_HUM = 68;
  const MAX_HUM = 70;
  const STEP = 6;

  // FIX: riego ON debe dejar state.riego=true y OFF => false
  state.riego = deviceOn;
  if (deviceOn) {
    state.humedad_pct = Math.min(MAX_HUM, (state.humedad_pct ?? NORMAL_HUM) + STEP);
  } else {
    state.humedad_pct = Math.max(NORMAL_HUM, (state.humedad_pct ?? MAX_HUM) - STEP);
  }

}

export async function executeAction(supabase, actionObj, chatId) {
  const current = await ensureDeviceState(supabase, chatId);
  const state = { ...(current.state || getDefaultState()) };

  if (!actionObj) return { ...current, state, applied: false };

  const { action, device } = actionObj;
  const on = action === 'turn_on';

  // soportamos luz/aire + simuladores
  if (!['luz', 'aire', 'temperatura_c', 'humedad_pct', 'riego'].includes(device)) {
    return { ...current, state, applied: false };
  }

  if (device === 'luz') {
    state.luz = on;
    const lastAction = on ? actionToLastActionTurnOn('luz') : actionToLastActionTurnOff('luz');
    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  if (device === 'aire') {
    state.aire = on;
    const lastAction = on ? actionToLastActionTurnOn('aire') : actionToLastActionTurnOff('aire');
    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  if (device === 'temperatura_c') {
    applySimulatedModeFromTemperature(state, on);

    // lógica demo: si se pasa de umbral, activar aire automático (puede apagarse cuando baje)
    if (state.temperatura_c >= 32) state.aire = true;
    if (!on && state.temperatura_c <= 30) state.aire = false;

    const lastAction = on
      ? actionToLastActionTurnOn('temperatura_c')
      : actionToLastActionTurnOff('temperatura_c');

    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  if (device === 'humedad_pct') {
    applySimulatedModeFromHumidity(state, on);

    // si queda muy seca, encendemos riego automático (demo)
    if (on && state.humedad_pct <= 45) state.riego = true;

    const lastAction = on
      ? actionToLastActionTurnOn('humedad_pct')
      : actionToLastActionTurnOff('humedad_pct');

    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  if (device === 'riego') {
    applySimulatedModeFromIrrigation(state, on);

    // si alcanza nivel adecuado, apagar riego
    if (state.humedad_pct >= 70) state.riego = false;

    const lastAction = on
      ? actionToLastActionTurnOn('riego')
      : actionToLastActionTurnOff('riego');

    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  return { ...current, state, applied: false };
}

export async function toggleDevice(supabase, device, chatId) {
  const current = await ensureDeviceState(supabase, chatId);
  const state = { ...(current.state || getDefaultState()) };

  if (device === 'luz') {
    const next = !state.luz;
    state.luz = next;
    const lastAction = next ? 'encender_luz' : 'apagar_luz';
    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  if (device === 'aire') {
    const next = !state.aire;
    state.aire = next;
    const lastAction = next ? 'encender_aire' : 'apagar_aire';
    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  // Para nuevos toggles invertimos el modo (temperatura/humedad) o riego
  if (device === 'temperatura_c') {
    const next = !state.modoCalor;
    await executeAction(
      supabase,
      { action: next ? 'turn_on' : 'turn_off', device: 'temperatura_c' },
      chatId
    );
    return { ...state, applied: true };
  }

  if (device === 'humedad_pct') {
    const next = !state.modoSeco;
    await executeAction(
      supabase,
      { action: next ? 'turn_on' : 'turn_off', device: 'humedad_pct' },
      chatId
    );
    return { ...state, applied: true };
  }

  if (device === 'riego') {
    const next = !state.riego;
    await executeAction(
      supabase,
      { action: next ? 'turn_on' : 'turn_off', device: 'riego' },
      chatId
    );
    return { ...state, applied: true };
  }

  return { ...current, state, applied: false };
}

