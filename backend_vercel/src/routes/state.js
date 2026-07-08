export function stateRoute(supabase) {
  return async function stateHandler(req, res) {
    try {
      const chatId = req.params.chatId;

      const { data, error } = await supabase
        .from('device_states')
        .select('chat_id, state, last_action, updated_at')
        .eq('chat_id', chatId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // si no existe, delegamos en ensure vía un create implícito no disponible aquí.
        // para mantener fase 1 simple, respondemos defaults.
        return res.json({
          devices: { luz: false, aire: false },
          lastAction: 'init',
          updatedAt: null
        });
      }

      return res.json({
        devices: { luz: !!data.state?.luz, aire: !!data.state?.aire },
        lastAction: data.last_action,
        updatedAt: data.updated_at
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo estado' });
    }
  };
}

