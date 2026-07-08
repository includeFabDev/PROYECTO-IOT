import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(process.cwd(), '.env')
});

export const env = {
  PORT: process.env.PORT || 3000,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
};
