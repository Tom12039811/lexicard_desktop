import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[LexiCard] Chybí env proměnné VITE_SUPABASE_URL nebo VITE_SUPABASE_ANON_KEY.\n' +
    'Zkontroluj soubor .env v root složce projektu a nastavení ve Vercel dashboardu.'
  )
}

export const supabase = createClient(
  supabaseUrl  ?? '',
  supabaseAnonKey ?? ''
)
