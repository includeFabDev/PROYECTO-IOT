import { createApp } from './app.js';
import { env } from './config/env.js';

// Vercel serverless entrypoint.
// Exportamos un handler función (req,res) para que Vercel pueda ejecutar Express.

const app = createApp();

export default function handler(req, res) {
  try {
    // Importante: NO retornar `app(req,res)`.
    // Express maneja internamente el flujo con res.send/res.json.
    return app(req, res);
  } catch (err) {
    console.error('[vercel-handler] error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    return undefined;
  }
}

// También dejamos una export nombrada para compatibilidad con algunos adapters.
export function vercelHandler(req, res) {
  try {
    return app(req, res);
  } catch (err) {
    console.error('[vercelHandler named] error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    return undefined;
  }
}


