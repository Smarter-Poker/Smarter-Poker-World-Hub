const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const r = await sb.from('tour_event_details').select('tour_code, series_name, event_name, buy_in, guaranteed, start_date, source')
  const byTour = {}
  r.data?.forEach(e => {
    if (!byTour[e.tour_code]) byTour[e.tour_code] = []
    byTour[e.tour_code].push(e)
  })

  for (const [code, events] of Object.entries(byTour).sort((a,b)=>b[1].length-a[1].length)) {
    const withDate = events.filter(e => e.start_date).length
    const withBuyin = events.filter(e => e.buy_in).length
    const withGtd = events.filter(e => e.guaranteed).length
    const seriesNames = [...new Set(events.map(e => e.series_name))]

    console.log(code + ': ' + events.length + ' events | ' + seriesNames.length + ' stops | dates:' + withDate + '/' + events.length + ' buyin:' + withBuyin + '/' + events.length + ' gtd:' + withGtd + '/' + events.length)
    seriesNames.forEach(s => console.log('   + ' + s))
  }
  console.log('\nTOTAL EVENTS: ' + r.data?.length)
}
run()
