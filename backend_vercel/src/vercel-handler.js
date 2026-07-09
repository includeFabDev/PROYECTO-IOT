import { createApp } from './app.js';
import { env } from './config/env.js';

// Vercel serverless entrypoint.
// Exportamos un handler función (req,res) para que Vercel pueda ejecutar Express.

const app = createApp();

export default async function handler(req, res) {
  // Ajuste defensivo: Vercel a veces no configura bodyparser dependiendo del runtime
  // pero ya tenemos express.json() en createApp().
  return app(req, res);
}

// También dejamos una export nombrada para compatibilidad con algunos adapters.
export function vercelHandler(req, res) {
  return app(req, res);
}

