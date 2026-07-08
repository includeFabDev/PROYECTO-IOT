const DEFAULT_STATE = {
  luz: false,
  aire: false,
  riego: false,
  temperatura_c: 27,
  humedad_pct: 68,
  modoAutomatico: true,
  horaVirtual: '18:45'
};

export function getDefaultState() {
  return { ...DEFAULT_STATE };
}

export async function ensureDeviceState(supabase, chatId) {
  const { data, error } = await supabase
    .from('device_states')
    .select('chat_id, state, last_action, updated_at')
    .eq('chat_id', chatId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const payload = {
      chat_id: chatId,
      state: getDefaultState(),
      last_action: 'init'
    };

    const { data: inserted } = await supabase
      .from('device_states')
      .upsert(payload, { onConflict: 'chat_id' })
      .select('chat_id, state, last_action, updated_at')
      .single();

    return inserted;
  }

  return data;
}

export async function saveDeviceState(supabase, chatId, nextState, lastAction) {
  const { data, error } = await supabase
    .from('device_states')
    .upsert(
      {
        chat_id: chatId,
        state: nextState,
        last_action: lastAction
      },
      { onConflict: 'chat_id' }
    )
    .select('chat_id, state, last_action, updated_at')
    .single();

  if (error) throw error;
  return data;
}

