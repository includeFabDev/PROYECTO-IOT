import { ensureDeviceState, saveDeviceState, getDefaultState } from './deviceStates.js';

function actionToLastActionTurnOn(device) {
  return device === 'luz' ? 'encender_luz' : 'encender_aire';
}

function actionToLastActionTurnOff(device) {
  return device === 'luz' ? 'apagar_luz' : 'apagar_aire';
}

export async function executeAction(supabase, actionObj, chatId) {
  console.log('[executeAction] chatId:', chatId);
  console.log('[executeAction] actionObj:', actionObj);

  const current = await ensureDeviceState(supabase, chatId);
  console.log('[executeAction] current:', current);

  const state = { ...(current.state || getDefaultState()) };


  if (!actionObj) {
    return { ...current, state, applied: false };
  }

  const { action, device } = actionObj;
  if (device !== 'luz' && device !== 'aire') {
    return { ...current, state, applied: false };
  }

  if (device === 'luz') {
    state.luz = action === 'turn_on';
    const lastAction = action === 'turn_on' ? actionToLastActionTurnOn('luz') : actionToLastActionTurnOff('luz');
    return {
      ...(await saveDeviceState(supabase, chatId, state, lastAction)),
      applied: true
    };
  }

  // aire
  state.aire = action === 'turn_on';
  const lastAction = action === 'turn_on' ? actionToLastActionTurnOn('aire') : actionToLastActionTurnOff('aire');
  return {
    ...(await saveDeviceState(supabase, chatId, state, lastAction)),
    applied: true
  };
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

  return { ...current, state, applied: false };
}

