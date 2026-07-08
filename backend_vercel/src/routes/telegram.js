import { parseKeywordsToAction } from '../services/interpreterKeywords.js';
import { executeAction, toggleDevice } from '../services/executeAction.js';
import { ensureDeviceState } from '../services/deviceStates.js';

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

export function telegramWebhookRoute(supabase) {
  return async function telegramWebhookHandler(req, res) {
    try {
      const body = req.body || {};
      const { chatId, text } = extractTelegramTextAndChatId(body);

      if (!chatId) return res.status(200).json({ ok: true, ignored: true });

      // callbacks: toggle según el estado actual (esto corrige el problema del toggle fijo)
      if (text === 'luz_toggle') {
        await toggleDevice(supabase, 'luz', chatId);
        return res.json({ ok: true });
      }

      if (text === 'aire_toggle') {
        await toggleDevice(supabase, 'aire', chatId);
        return res.json({ ok: true });
      }

      const actionObj = parseKeywordsToAction(text || '');
      console.log('[Telegram] texto recibido:', text);
      console.log('[Telegram] actionObj:', actionObj);
      await executeAction(supabase, actionObj, chatId);

      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error en webhook' });
    }
  };
}

