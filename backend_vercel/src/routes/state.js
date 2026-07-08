import { getDefaultState } from '../services/deviceStates.js';

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

      const merged = { ...getDefaultState(), ...(data.state || {}) };

      return res.json({
        devices: {
          luz: !!merged.luz,
          aire: !!merged.aire,
          riego: !!merged.riego,
          temperatura_c: merged.temperatura_c,
          humedad_pct: merged.humedad_pct,
          modoAutomatico: !!merged.modoAutomatico,
          horaVirtual: merged.horaVirtual
        },
        lastAction: data.last_action,
        updatedAt: data.updated_at
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error leyendo estado' });
    }
  };
}

