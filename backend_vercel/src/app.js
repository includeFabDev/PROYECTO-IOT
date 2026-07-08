import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { getSupabaseClient } from './services/supabaseClient.js';
import { stateRoute } from './routes/state.js';
import { telegramWebhookRoute } from './routes/telegram.js';
import { ensureDeviceState } from './services/deviceStates.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));


  const supabase = getSupabaseClient();

  app.get('/api/state/:chatId', awaitableHandler(async (req, res) => {
    // para asegurar inicialización automática como en la versión original
    const chatId = req.params.chatId;
    await ensureDeviceState(supabase, chatId);
    return stateRoute(supabase)(req, res);
  }));

  app.post('/api/telegram-webhook', awaitableHandler(telegramWebhookRoute(supabase)));

  // helper local
  function awaitableHandler(fn) {
    return async (req, res) => {
      try {
        return await fn(req, res);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal error' });
      }
    };
  }

  return app;
}

// Nota: app.listen() vive en entrypoint.

