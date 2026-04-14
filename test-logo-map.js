const fs = require('fs');
const TOUR_LOGO_MAP = {
    'WSOP':       '/images/tours/wsop.png',
    'WSOPC':      '/images/tours/wsopc.png',
    'WPT':        '/images/tours/wpt.png',
    'MSPT':       '/images/tours/mspt.png',
    'RGPS':       '/images/tours/rgps.png',
    'PGT':        '/images/tours/pgt.png',
    'CPPT':       '/images/tours/cppt.png',
    'NAPT':       '/images/tours/napt.png',
    'FPN':        '/images/tours/fpn.png',
    'LIPS':       '/images/tours/lips.png',
    'BPO':        '/images/tours/bpo.png',
    'GCPT':       '/images/tours/gcpt.jpg',
    'ROUGHRIDER': '/images/tours/roughrider.png',
    'PAT':        '/images/tours/pat.jpg',
};
const series = {
  id: 686,
  tour: 'WSOP'
};
const rawTourCode = (series.tour || series.tour_code || series.short_name || '').toUpperCase();
console.log('rawTourCode:', rawTourCode);
console.log('Mapped:', TOUR_LOGO_MAP[rawTourCode]);
