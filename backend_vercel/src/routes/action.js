import { executeAction, toggleDevice } from '../services/executeAction.js';

export function actionRoute(supabase) {
  return async function actionHandler(req, res) {
    try {
      const body = req.body || {};
      const { chatId, device, mode, text } = body;

      if (!chatId && chatId !== 0) {
        return res.status(400).json({ error: 'Missing chatId' });
      }

      // Modo: explícito para toggles rápidos
      if (device && mode) {
        // mode: 'on' | 'off'
        const desiredAction = mode === 'on' ? 'turn_on' : 'turn_off';
        const actionObj = { action: desiredAction, device };
        await executeAction(supabase, actionObj, chatId);
        return res.json({ ok: true });
      }

      // Alternativa: togglear según dispositivo
      if (device && !mode) {
        await toggleDevice(supabase, device, chatId);
        return res.json({ ok: true });
      }

      // Alternativa: pasar texto (para parser)
      if (typeof text === 'string') {
        const actionObj = (await import('../services/interpreterKeywords.js')).parseKeywordsToAction(text);
        await executeAction(supabase, actionObj, chatId);
        return res.json({ ok: true });
      }

      // Caso: body ya trae actionObj
      if (body.actionObj) {
        await executeAction(supabase, body.actionObj, chatId);
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'Invalid request body' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error en acción' });
    }
  };
}

