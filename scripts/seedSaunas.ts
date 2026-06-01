import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const saunas = [
  {
    name: 'Termy Maltańskie Poznań',
    city: 'Poznań',
    voivodeship: 'wielkopolskie',
    category: 'public_sauna',
    source: 'PTS',
    source_url:
      'https://www.polskietowarzystwosaunowe.pl',
    latitude: 52.406,
    longitude: 16.979,
  },
  {
    name: 'Suntago',
    city: 'Wręcza',
    voivodeship: 'mazowieckie',
    category: 'public_sauna',
    source: 'PTS',
    source_url:
      'https://www.polskietowarzystwosaunowe.pl',
    latitude: 52.038,
    longitude: 20.453,
  },
  {
    name: 'Chochołowskie Termy',
    city: 'Chochołów',
    voivodeship: 'małopolskie',
    category: 'public_sauna',
    source: 'PTS',
    source_url:
      'https://www.polskietowarzystwosaunowe.pl',
    latitude: 49.367,
    longitude: 19.824,
  },
]

async function run() {
  const { error } = await supabase
    .from('saunas')
    .insert(saunas)

  if (error) {
    console.error(error)
    return
  }

  console.log('Imported')
}

run()