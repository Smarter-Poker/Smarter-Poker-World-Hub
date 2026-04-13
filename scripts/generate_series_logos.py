#!/usr/bin/env python3
"""
Poker Series Logo Generator — Batch v1.0
Generates venue-inspired logos for all 187 poker series using DALL-E 3,
uploads to Supabase Storage, and writes logo_url back to DB.
"""

import os, re, json, time, requests
from supabase import create_client
from io import BytesIO

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
OPENAI_KEY   = os.environ.get('OPENAI_API_KEY', '')
BUCKET       = 'series-logos'

sb = create_client(SUPABASE_URL, SERVICE_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# TOUR BLOCKLIST — never generate logos for these
# ─────────────────────────────────────────────────────────────────────────────
TOUR_BLOCKLIST = ['mspt','wsop','wsopc','rgps','gcpt','lips','rough rider',
                  'wpt',' pat ','pgt','fpn','napt','cppt']

# ─────────────────────────────────────────────────────────────────────────────
# VENUE / LOCATION THEME ENGINE
# Maps keywords → visual identity for prompt generation
# ─────────────────────────────────────────────────────────────────────────────

VENUE_THEMES = {
    # Casino brands
    'hard rock':    {'palette': 'electric guitar red and black, rock music energy, chrome lightning bolts', 'frame': 'electric guitar fretboard border with chrome tuning peg corner accents', 'bg': 'dark charcoal with red neon electric glow'},
    'horseshoe':    {'palette': 'lucky green and classic gold', 'frame': 'horseshoe arch ornate border with clover corner accents', 'bg': 'deep forest green with golden glow'},
    'mgm':          {'palette': 'Hollywood gold and legendary scarlet', 'frame': 'Art Deco gold border with MGM lion silhouette watermark', 'bg': 'deep black with Hollywood gold spotlight'},
    'foxwoods':     {'palette': 'Mashantucket forest green and copper', 'frame': 'New England timber lodge border with Native American Pequot geometric copper corner accents', 'bg': 'deep Connecticut forest green gradient'},
    'mohegan':      {'palette': 'Mohegan tribal burgundy and copper gold', 'frame': 'tribal geometric border with Mohegan wolf totem corner medallions', 'bg': 'deep burgundy with copper tribal glow'},
    'bellagio':     {'palette': 'Italian luxury gold and marble black', 'frame': 'ornate gold filigree Italian architectural border with lion head corner medallions', 'bg': 'deep black marble with warm gold vignette'},
    'borgata':      {'palette': 'Atlantic City blue-green and steel chrome', 'frame': 'sleek modern steel border with ocean blue accent strips', 'bg': 'dark navy with Atlantic blue neon glow'},
    'rivers casino':{'palette': 'riverfront deep blue and silver chrome', 'frame': 'industrial steel border with river wave corner accents', 'bg': 'dark navy with river blue glow from below'},
    'jack casino':  {'palette': 'playing card black and red with gold', 'frame': 'card suit themed border with spade and diamond corner accents', 'bg': 'deep black with red and gold casino glow'},
    'wind creek':   {'palette': 'Muscogee Creek tribal earth tones, terracotta and tan', 'frame': 'Creek Nation geometric border with tribal pottery pattern corner accents', 'bg': 'warm earth brown gradient with terracotta glow'},
    'cherokee':     {'palette': 'Cherokee mountain blue and pine green', 'frame': 'mountain rustic border with Cherokee tribal star quilt corner patterns', 'bg': 'deep Appalachian mountain blue-green gradient'},
    'choctaw':      {'palette': 'Choctaw red and black diamond pattern', 'frame': 'Choctaw diamond geometric border with traditional stickball corner accents', 'bg': 'deep crimson with black diamond pattern'},
    'winstar':      {'palette': 'Chickasaw Nation royal blue and gold', 'frame': 'grand architectural border with Oklahoma prairie corner accents', 'bg': 'deep royal blue with warm gold glow — largest casino in the world'},
    'seminole':     {'palette': 'Seminole Tribe vibrant patchwork colors, orange and green', 'frame': 'Seminole patchwork quilt inspired colorful geometric border', 'bg': 'deep Florida green with orange tribal accent glow'},
    'agua caliente':{'palette': 'Cahuilla desert pink and turquoise', 'frame': 'desert southwest Art Deco border with palm spring mid-century modern corner accents', 'bg': 'warm desert sunset pink-orange gradient'},
    'morongo':      {'palette': 'Serrano Nation desert sand and turquoise blue', 'frame': 'San Bernardino mountains styled border with southwest geometric corner accents', 'bg': 'warm California desert tan with turquoise accent'},
    'pechanga':     {'palette': 'Luiseño Nation sage green and terracotta', 'frame': 'Southern California tribal border with Luiseño acorn motif corner accents', 'bg': 'warm sage green with earth terracotta glow'},
    'sandia':       {'palette': 'Sandia Mountain steel blue and sunset orange', 'frame': 'New Mexico southwest border with Tiwa Pueblo geometric corner accents', 'bg': 'deep blue New Mexico sky gradient with orange sunset glow'},
    'ilani':        {'palette': 'Cowlitz tribal cedar brown and forest green', 'frame': 'Pacific Northwest cedar timber border with Cowlitz tribal symbol corner accents', 'bg': 'deep Pacific Northwest forest green with cedar brown'},
    'chinook winds':{'palette': 'Oregon coast bioluminescent teal and copper', 'frame': 'rugged dark steel border with Siletz tribal angular copper geometric corner details', 'bg': 'stormy Pacific ocean navy to deep teal gradient with wave texture'},
    'chumash':      {'palette': 'Chumash ocean blue and California gold', 'frame': 'Santa Barbara coastal border with Chumash sun wheel corner medallions', 'bg': 'deep California ocean blue with warm gold California sunset'},
    'tulalip':      {'palette': 'Tulalip Tribes Pacific northwest deep blue and silver', 'frame': 'Puget Sound maritime border with salmon totem corner accents', 'bg': 'deep Puget Sound navy with silver tribal glow'},
    'snoqualmie':   {'palette': 'Snoqualmie Falls mist silver and evergreen', 'frame': 'Pacific Northwest waterfall border with cedar and fern corner accents', 'bg': 'deep evergreen forest with silver mist atmospheric glow'},
    'suquamish':    {'palette': 'Suquamish Tribe turquoise water and cedar', 'frame': 'Northwest coastal border with Chief Seattle tribute corner accents', 'bg': 'deep Puget Sound blue-green with cedar warmth'},
    'muckleshoot':  {'palette': 'Muckleshoot Tribe copper salmon and forest', 'frame': 'Pacific Northwest tribal salmon-run border with arrow glyph corner accents', 'bg': 'deep Cascade forest green with copper salmon glow'},
    'emerald queen':{'palette': 'riverboat emerald green and brass gold', 'frame': 'Mississippi riverboat paddle-wheeler inspired border with brass fitting corner accents', 'bg': 'deep riverboat dark green with vintage brass casino atmosphere'},
    'gold strike':  {'palette': 'Gold Rush fever gold and Mississippi river blue', 'frame': 'gold mining prospector themed border with gold nugget corner accents', 'bg': 'deep Mississippi river blue with gold rush warm glow'},
    'pearl river':  {'palette': 'Pearl River deep green and antebellum white', 'frame': 'Mississippi Old South plantation-inspired ornate border with river pearl corner accents', 'bg': 'deep Southern Mississippi green with antique white accent'},
    'golden nugget':{'palette': 'classic casino gold and vintage Vegas neon', 'frame': 'vintage Vegas signage inspired border with golden nugget corner accents', 'bg': 'deep midnight black with vintage gold neon glow'},
    'hustler':      {'palette': 'high-roller electric blue and neon white', 'frame': 'modern sleek steel border with electric blue corner accent strips', 'bg': 'deep urban black with electric blue celebrity poker energy'},
    'commerce':     {'palette': 'Card room emerald green and classic ivory', 'frame': 'classic Los Angeles card room border with California sun corner accents', 'bg': 'deep felt green with warm California golden glow'},
    'bicycle':      {'palette': 'Bicycle playing card red white and blue classic', 'frame': 'vintage bicycle playing card themed border with ace of spades corner accents', 'bg': 'deep classic card room green with red and blue vintage casino atmosphere'},
    'black hawk':   {'palette': 'Colorado mountain granite and gold', 'frame': 'Rocky Mountain mining town border with gold rush corner accents', 'bg': 'deep Colorado granite grey with Rockies gold horizon glow'},
    'isle casino':  {'palette': 'riverboat deep blue and steamboat gold', 'frame': 'Iowa riverboat steamboat border with paddle wheel corner accents', 'bg': 'deep Mississippi river night blue with warm steamboat gold'},
    'harrahs':      {'palette': 'classic Harrahs red and casino gold', 'frame': 'classic American casino border with star-and-banner corner accents', 'bg': 'deep classic casino red with warm gold American glamour'},
    'caesars':      {'palette': 'Roman Empire imperial gold and marble white', 'frame': 'Roman column and laurel wreath ornate border with Caesar coin corner medallions', 'bg': 'deep Roman marble white and imperial gold with goddess of fortune atmosphere'},
    'wynn':         {'palette': 'ultra-luxury champagne gold and ivory white', 'frame': 'ultra-premium Wynn signature curved border with floral corner medallions', 'bg': 'deep satin black with champagne gold ultra-luxury atmosphere'},
    'encore':       {'palette': 'deep red rose and brushed gold', 'frame': 'Encore signature rose-gold curved luxurious border with red rose corner accents', 'bg': 'deep black satin with red rose and gold ultra-luxury glow'},
    'venetian':     {'palette': 'Venetian canal blue and Italian gold', 'frame': 'Italian Renaissance gondola border with Venetian masks corner accents', 'bg': 'deep canal night blue with Italian Renaissance gold atmosphere'},
    'aria':         {'palette': 'modern ultra-luxury steel blue and champagne', 'frame': 'sleek modern luxury architectural border with crystalline corner accents', 'bg': 'deep modern luxury charcoal with blue-silver City Center atmosphere'},
    'mandalay bay': {'palette': 'Mandalay tropical gold and lush green', 'frame': 'Southeast Asian temple inspired border with Burmese pagoda corner accents', 'bg': 'deep tropical garden green with warm Burmese gold temple glow'},
    'paris':        {'palette': 'Parisian romantic navy blue and Eiffel gold', 'frame': 'Eiffel Tower inspired steel lattice border with fleur-de-lis corner accents', 'bg': 'deep Paris midnight blue with warm romantic Eiffel gold glow'},
    'bally':        {'palette': 'classic Vegas showgirl magenta and gold', 'frame': 'glamorous showgirl vintage Vegas border with cabaret feather corner accents', 'bg': 'deep Vegas midnight black with showgirl magenta and gold spotlight'},
    'tropicana':    {'palette': 'tropical island lime green and flamingo pink', 'frame': 'tropical resort border with flamingo and palm tree corner accents', 'bg': 'deep tropical lush green with warm Miami flamingo pink glow'},
    'lucky club':   {'palette': 'lucky shamrock green and gold', 'frame': 'Irish luck themed border with shamrock and horseshoe corner accents', 'bg': 'deep shamrock Irish green with gold lucky charm glow'},
    'foxen':        {'palette': 'Santa Barbara wine country burgundy and gold', 'frame': 'vineyard grapevine border with California wine barrel corner accents', 'bg': 'deep Central Coast burgundy wine with warm California harvest gold'},
    'peppermill':   {'palette': 'Reno neon fuchsia and deep purple', 'frame': 'vintage Reno neon sign inspired border with desert sierra corner accents', 'bg': 'deep desert Nevada charcoal with vintage fuchsia and purple neon glow'},
    'atlantis':     {'palette': 'Reno mountain resort deep blue and gold', 'frame': 'Atlantis mythology inspired border with ocean wave and trident corner accents', 'bg': 'deep mythological ocean blue with ancient gold atlantean glow'},
    'silver legacy': {'palette': 'silver mining heritage silver and antique gold', 'frame': 'Victorian silver mining border with steam engine and pickaxe corner accents', 'bg': 'deep industrial Victorian charcoal with silver mine antique gold'},
    'downtown grand':{'palette': 'Fremont Street vintage neon and urban gold', 'frame': 'Fremont Street Experience neon canopy inspired border with vintage Vegas corner accents', 'bg': 'deep vintage urban black with Fremont neon multi-color glow'},
    'casino del sol':{'palette': 'Tohono O\'odham desert turquoise and terracotta', 'frame': 'Sonoran Desert border with Tohono O\'odham tribal sun symbol corner accents', 'bg': 'warm Arizona desert sunset with turquoise tribal accent glow'},
    'talking stick':{'palette': 'Salt River Pima-Maricopa turquoise and earth', 'frame': 'Pima-Maricopa tribal border with Salt River geometric corner patterns', 'bg': 'warm Sonoran desert terracotta with authentic tribal turquoise'},
    'live casino':  {'palette': 'modern electric blue and white chrome', 'frame': 'sleek modern LED-lit angular steel border with electric blue corner accent strips', 'bg': 'deep modern urban charcoal with electric blue Live! Casino energy neon glow'},
    'maryland live':{'palette': 'Maryland state flag red and gold cross-bottony', 'frame': 'Maryland heraldic cross-bottony checkered border with state flag corner badges', 'bg': 'deep Maryland red with gold heraldic cross-bottony pattern'},
    'ocean casino':{'palette': 'Atlantic Ocean seafoam blue and silver white', 'frame': 'Atlantic coastal border with ocean wave and seashell corner accents', 'bg': 'deep Atlantic blue with seafoam and white ocean mist atmosphere'},
    'hard rock atlantic':{'palette': 'AC boardwalk rock music red and chrome', 'frame': 'Atlantic City boardwalk rock music border with guitar and wave corner accents', 'bg': 'deep Atlantic City night with boardwalk red neon chrome energy'},
    'meadows':      {'palette': 'Pennsylvania country meadow green and gold', 'frame': 'Pittsburgh Pennsylvania border with Steelers gold and meadow green corner accents', 'bg': 'deep Pennsylvania green meadow with warm Pittsburgh golden glow'},
    'valley forge':  {'palette': 'Valley Forge colonial blue and buff', 'frame': 'Colonial American patriot inspired border with Valley Forge winter camp corner accents', 'bg': 'deep colonial navy blue with American patriot buff gold'},
    'presque isle':  {'palette': 'Lake Erie blue and Great Lakes silver', 'frame': 'Great Lakes maritime border with Erie lighthouse corner accents', 'bg': 'deep Lake Erie blue-grey with Great Lakes lighthouse silver'},
    'parx':         {'palette': 'Philadelphia sports green and gold', 'frame': 'Philadelphia Parx racing and card border with Keystone State corner accents', 'bg': 'deep Philly charcoal with Pennsylvania Keystone green and gold'},
    'four winds':   {'palette': 'Pokagon Band lakeside blue and forest green', 'frame': 'Lake Michigan shoreline border with Potawatomi tribal wind compass corner accents', 'bg': 'deep Great Lakes navy with Pokagon Band tribal forest green'},
    'firekeepers':  {'palette': 'Nottawaseppi Huron Band fire orange and night black', 'frame': 'ceremonial fire border with Potawatomi keeper of the fire corner accents', 'bg': 'deep ceremonial night black with sacred fire orange glow from center'},
    'little six':   {'palette': 'Mdewakanton Sioux native earth tones and red', 'frame': 'Dakota tribal border with Sioux geometric star quilt corner patterns', 'bg': 'deep Dakota prairie night with traditional red and earth tone tribal glow'},
    'prairie meadows':{'palette': 'Iowa prairie golden wheat and sky blue', 'frame': 'Iowa prairie landscape border with horse racing silhouette corner accents', 'bg': 'deep Iowa prairie blue sky with warm golden wheat harvest glow'},
    'horseshoe hammond':{'palette': 'Indiana riverside gold and deep blue', 'frame': 'Lake Michigan shoreline border with Calumet Region steel corner accents', 'bg': 'deep Lake Michigan blue with steel industry Hammond Indiana gold'},
    'ameristar':    {'palette': 'Missouri riverboat deep blue and gold', 'frame': 'Missouri River steamboat riverboat border with paddle wheel corner accents', 'bg': 'deep Missouri river night blue with warm steamboat gold atmosphere'},
    'lumiere':      {'palette': 'St. Louis Gateway Arch silver and Missouri gold', 'frame': 'Gateway Arch inspired architectural border with Missouri river corner accents', 'bg': 'deep St. Louis charcoal with Gateway Arch silver and warm Missouri gold'},
    'lady luck':    {'palette': 'lucky crimson and Irish green with gold', 'frame': 'four-leaf clover lucky charm themed border with lady luck corner accents', 'bg': 'deep lucky green with crimson lady luck vintage Vegas neon glow'},
    'downstream':   {'palette': 'Quapaw Nation river blue and earth brown', 'frame': 'Grand Lake Oklahoma riverside border with Quapaw tribal corner accents', 'bg': 'deep Oklahoma river blue-brown with Grand Lake warm earth glow'},
    'cherokee nation':{'palette': 'Cherokee seven-pointed star and tribal colors', 'frame': 'Cherokee Nation seven-pointed star border with traditional Eastern Band corner accents', 'bg': 'deep Cherokee Mountain blue-green with sacred fire orange glow'},
    'potawatomi':   {'palette': 'Potawatomi fire keeper orange and night black', 'frame': 'Potawatomi keeper of the fire ceremonial border with tribal fire corner accents', 'bg': 'deep ceremonial black with Potawatomi sacred orange fire glow'},
    'green bay':    {'palette': 'Green Bay Packers gold and green', 'frame': 'Wisconsin Great Lakes border with Lambeau Field gold corner accents', 'bg': 'deep Wisconsin forest green with legendary Packer gold glow'},
    'lodge casino':  {'palette': 'Colorado mountain lodge brown and gold', 'frame': 'Rocky Mountain timber lodge border with Colorado peak corner accents', 'bg': 'deep Colorado mountain forest with warm timber lodge gold'},
    'isle of capri': {'palette': 'Italian isle blue and Mediterranean gold', 'frame': 'Isle of Capri Mediterranean border with Italian coastal corner accents', 'bg': 'deep Mediterranean blue with warm Capri island golden sunrise'},
    'grand falls':  {'palette': 'Iowa waterfall deep blue and earth tone', 'frame': 'Iowa falls border with Blue Mounds limestone corner accents', 'bg': 'deep Iowa river blue with warm prairie earth glow'},
    'sky ute':      {'palette': 'Ute Mountain Nation southwestern turquoise and red', 'frame': 'Ute tribal geometric border with Bear Dance corner accents', 'bg': 'deep Ute mountain blue-purple with sacred turquoise and red glow'},
    'muckleshoot':  {'palette': 'Muckleshoot salmon copper and Pacific forest', 'frame': 'Pacific Northwest salmon run border with Muckleshoot tribal arrow glyph corner accents', 'bg': 'deep Washington evergreen with copper salmon tribal glow'},
    'pala':         {'palette': 'Pala tribe sage and California desert gold', 'frame': 'Southern California Palomar Mountain border with Cupeno tribal corner accents', 'bg': 'warm San Diego County sage green with desert gold California glow'},
    'barona':       {'palette': 'Barona Band golden California hills and blue sky', 'frame': 'San Diego coastal border with Kumeyaay tribal sun corner medallions', 'bg': 'warm Southern California golden hills with Kumeyaay sky blue'},
}

STATE_THEMES = {
    'NV': {'palette': 'Las Vegas neon multi-color on deep desert black', 'frame': 'classic casino neon sign border with playing card suit corner accents', 'bg': 'deep Nevada desert night with vibrant casino neon atmosphere'},
    'FL': {'palette': 'Florida sunshine orange and oceanic blue', 'frame': 'tropical border with palm tree and flamingo corner accents', 'bg': 'warm Florida sunset orange-to-crimson with palm tree silhouettes'},
    'CA': {'palette': 'California sun gold and Pacific blue', 'frame': 'California golden coast border with surf and sunshine corner accents', 'bg': 'deep Pacific blue with warm California golden sunset glow'},
    'TX': {'palette': 'Texas Lone Star deep blue and burnt orange', 'frame': 'Texas longhorn cattle drive border with lone star corner accents', 'bg': 'deep Texas sky blue with warm burnt orange lone star horizon'},
    'LA': {'palette': 'New Orleans jazz purple and gold with Mardi Gras green', 'frame': 'New Orleans wrought-iron French Quarter border with fleur-de-lis corner accents', 'bg': 'deep Louisiana bayou with jazz-age Mardi Gras purple-gold glow'},
    'MS': {'palette': 'Mississippi Deep South river blue and Spanish moss green', 'frame': 'Mississippi River steamboat border with antebellum plantation corner accents', 'bg': 'deep Southern Mississippi night with river glow and Spanish moss'},
    'PA': {'palette': 'Philadelphia colonial blue and Liberty gold', 'frame': 'Pennsylvania steel industrial border with Liberty Bell silhouette corner accents', 'bg': 'deep urban Pennsylvania charcoal with electric Liberty blue glow'},
    'NJ': {'palette': 'Atlantic City oceanfront blue and boardwalk gold', 'frame': 'Atlantic City boardwalk steel border with ocean wave corner accents', 'bg': 'deep Atlantic blue with boardwalk vintage neon gold atmosphere'},
    'CO': {'palette': 'Colorado Rocky Mountain blue and gold', 'frame': 'Rocky Mountain ridge border with Colorado aspen leaf corner accents', 'bg': 'deep mountain Colorado blue-purple with alpine gold sunrise'},
    'MN': {'palette': 'Minnesota North Star midnight blue and gold', 'frame': 'Great Lakes border with Minnesota loon and birch tree corner accents', 'bg': 'deep Minnesota lake midnight blue with North Star gold glow'},
    'WI': {'palette': 'Wisconsin dairy state forest green and gold', 'frame': 'Great Lakes border with Wisconsin Badger and maple corner accents', 'bg': 'deep Wisconsin lake and forest green with warm golden glow'},
    'MI': {'palette': 'Great Lakes Michigan blue and Motor City steel', 'frame': 'Great Lakes maritime border with auto industry motor city corner accents', 'bg': 'deep Great Lakes steely blue with Motor City industrial steel glow'},
    'IN': {'palette': 'Indiana steel blue and racing checkered', 'frame': 'Indy 500 racing inspired border with checkered flag corner accents', 'bg': 'deep Indiana industrial blue with Speedway checkered gold energy'},
    'OH': {'palette': 'Ohio buckeye deep scarlet and grey', 'frame': 'Ohio industrial border with Great Lakes and buckeye corner accents', 'bg': 'deep Ohio scarlet with industrial steel-grey urban glow'},
    'IA': {'palette': 'Iowa prairie golden wheat and river blue', 'frame': 'Iowa river border with golden cornfield and steamboat corner accents', 'bg': 'deep Iowa prairie with golden wheat horizon and river blue glow'},
    'MO': {'palette': 'Missouri Gateway Arch silver and river blue', 'frame': 'Gateway Arch border with Missouri River steamboat corner accents', 'bg': 'deep Missouri river blue with Gateway Arch silver city glow'},
    'IL': {'palette': 'Chicago urban steel blue and gold', 'frame': 'Chicago architectural border with lakefront and El train corner accents', 'bg': 'deep Chicago midnight blue with urban gold architectural glow'},
    'OR': {'palette': 'Oregon Pacific coast teal and forest green', 'frame': 'Pacific Northwest border with Douglas fir and coastal wave corner accents', 'bg': 'deep Oregon coastline navy-teal with Pacific Northwest forest green'},
    'WA': {'palette': 'Washington Cascade evergreen and Olympic blue', 'frame': 'Pacific Northwest Cascade border with Mount Rainier corner accents', 'bg': 'deep Washington State evergreen with Olympic Peninsula blue-green'},
    'AZ': {'palette': 'Arizona desert rust and turquoise', 'frame': 'Sonoran Desert border with saguaro cactus and turquoise corner accents', 'bg': 'warm Arizona desert sunset rust-orange with southwest turquoise glow'},
    'NM': {'palette': 'New Mexico adobe rust and turquoise sky', 'frame': 'adobe pueblo border with Zia sun symbol corner accents', 'bg': 'warm New Mexico adobe earth with traditional turquoise Zia sun glow'},
    'OK': {'palette': 'Oklahoma Cherokee nation earth and prairie sky', 'frame': 'Oklahoma native nations border with prairie wind corner accents', 'bg': 'deep Oklahoma grand prairie sky with warm earth and tribal glow'},
    'KS': {'palette': 'Kansas sunflower gold and prairie sky blue', 'frame': 'Kansas plains border with sunflower and wheat corner accents', 'bg': 'deep Kansas prairie sky blue with warm sunflower gold horizon'},
    'NE': {'palette': 'Nebraska cornhusker scarlet and cream', 'frame': 'Nebraska plains border with Platte River and prairie corner accents', 'bg': 'deep Nebraska sky blue with cornhusker scarlet and cream glow'},
    'SD': {'palette': 'South Dakota Badlands rust and Mount Rushmore grey', 'frame': 'Badlands geological border with Sioux Nation corner accents', 'bg': 'deep Dakota sky blue with Badlands rust-ochre landscape glow'},
    'ND': {'palette': 'North Dakota prairie blue and golden horizon', 'frame': 'Northern Plains border with Mandan tribal corner accents', 'bg': 'deep North Dakota sky with golden prairie horizon glow'},
    'MT': {'palette': 'Montana Big Sky country deep blue and gold', 'frame': 'Rocky Mountain frontier border with Big Sky and bear corner accents', 'bg': 'deep Montana sky blue with golden frontier mountain glow'},
    'WY': {'palette': 'Wyoming Old Faithful geyser steam and bison brown', 'frame': 'Yellowstone National Park inspired border with geyser and bison corner accents', 'bg': 'deep Wyoming sky with Yellowstone steam and frontier earth brown'},
    'ID': {'palette': 'Idaho mountain potato earth and Snake River blue', 'frame': 'Idaho backcountry mountain border with Snake River corner accents', 'bg': 'deep Idaho wilderness blue with mountain earth warm glow'},
    'UT': {'palette': 'Utah red rock canyon amber and blue sky', 'frame': 'Zion Canyon red rock border with Arches arch corner accents', 'bg': 'deep Utah sky blue with vivid Arches red rock amber canyon glow'},
    'NV_reno': {'palette': 'Reno Biggest Little City neon and Sierra Nevada blue', 'frame': 'vintage Reno neon sign border with Sierra Nevada mountain corner accents', 'bg': 'deep Sierra Nevada night with vintage Reno neon multi-color glow'},
    'KY': {'palette': 'Kentucky Derby horse racing emerald and gold', 'frame': 'Churchill Downs racing border with thoroughbred horse and mint julep corner accents', 'bg': 'deep Kentucky Bluegrass emerald with Churchill Downs golden race day'},
    'TN': {'palette': 'Tennessee mountains blue ridge and music gold', 'frame': 'Nashville music row border with guitar and Great Smoky Mountains corner accents', 'bg': 'deep Great Smoky Mountain blue-green with Nashville music gold neon'},
    'AL': {'palette': 'Alabama crimson tide and white', 'frame': 'Alabama border with Gulf Coast and steel magnolia corner accents', 'bg': 'deep Alabama crimson with white and Gulf blue glow'},
    'GA': {'palette': 'Georgia peach warm gold and deep Southern green', 'frame': 'Georgia peach blossom border with Cherokee rose corner accents', 'bg': 'warm Georgia peach golden sunset with deep Southern green'},
    'SC': {'palette': 'South Carolina palmetto green and gold', 'frame': 'Carolina coast border with palmetto tree and crescent moon corner accents', 'bg': 'deep Carolina coastal blue with palmetto golden green'},
    'NC': {'palette': 'North Carolina Cherokee mountain blue and dogwood white', 'frame': 'Blue Ridge Mountains border with Cherokee and coastal corner accents', 'bg': 'deep Blue Ridge Mountain blue with Carolina dogwood white and gold'},
    'VA': {'palette': 'Virginia colonial blue and Governor\'s Palace gold', 'frame': 'Colonial Williamsburg historical border with Virginia cardinal corner accents', 'bg': 'deep colonial Virginia blue with warm historic Williamsburg gold'},
    'MD': {'palette': 'Maryland flag red and gold cross-bottony heraldic', 'frame': 'Maryland heraldic cross-bottony flag border with Chesapeake corner accents', 'bg': 'deep Maryland red with Chesapeake Bay blue and heraldic gold'},
    'DE': {'palette': 'Delaware colonial blue and Delaware River silver', 'frame': 'First State colonial border with Washington crossing Delaware corner accents', 'bg': 'deep colonial Delaware blue with Delaware River silver glow'},
    'NY': {'palette': 'New York City skyline midnight blue and Empire gold', 'frame': 'NYC Art Deco architectural border with Empire State building corner accents', 'bg': 'deep NYC midnight with Empire State Art Deco gold skyline glow'},
    'CT': {'palette': 'Connecticut colonial blue and Foxwoods forest green', 'frame': 'New England border with colonial harbor and forest corner accents', 'bg': 'deep New England forest green with colonial Connecticut blue'},
    'MA': {'palette': 'Massachusetts colonial blue and Patriots navy', 'frame': 'Boston colonial border with Paul Revere and harbor corner accents', 'bg': 'deep Boston harbor colonial blue with patriot navy gold glow'},
    'RI': {'palette': 'Rhode Island ocean blue and Providence gold', 'frame': 'New England maritime border with Providence lighthouse corner accents', 'bg': 'deep Rhode Island ocean blue with Providence colonial gold'},
    'VT': {'palette': 'Vermont maple leaf crimson and forest green', 'frame': 'Green Mountain border with maple leaf and covered bridge corner accents', 'bg': 'deep Vermont forest green with warm maple crimson autumn glow'},
    'NH': {'palette': 'New Hampshire granite state grey and mountain gold', 'frame': 'White Mountains border with Old Man of the Mountain corner accents', 'bg': 'deep New Hampshire mountain grey with autumn golden foliage glow'},
    'ME': {'palette': 'Maine coastal navy and lighthouse red', 'frame': 'Maine coast border with lobster and lighthouse corner accents', 'bg': 'deep Maine Atlantic navy with rocky coast lighthouse red-white glow'},
    'HI': {'palette': 'Hawaii tropical volcanic black and hibiscus pink', 'frame': 'Hawaiian plumeria and wave border with volcanic Pele corner accents', 'bg': 'deep Hawaiian volcanic black with vivid tropical hibiscus and ocean blue'},
    'AK': {'palette': 'Alaska aurora borealis green-purple and midnight blue', 'frame': 'Alaska wilderness border with Northern Lights and totem pole corner accents', 'bg': 'deep Alaska midnight sky with magical aurora borealis green-purple glow'},
    'AB': {'palette': 'Alberta Rockies steel blue and Chinook arch gold', 'frame': 'Canadian Rockies Banff border with Calgary Stampede corner accents', 'bg': 'deep Canadian Rocky Mountain blue with warm Chinook arch golden glow'},
    'BC': {'palette': 'British Columbia Pacific northwest green and blue', 'frame': 'BC coastal border with orca whale and mountain corner accents', 'bg': 'deep BC coastal forest green with Pacific ocean blue glow'},
    'ON': {'palette': 'Ontario Great Lakes blue and maple leaf gold', 'frame': 'Ontario border with CN Tower and Niagara Falls corner accents', 'bg': 'deep Ontario lake blue with Canadian maple leaf warm gold'},
    'QC': {'palette': 'Quebec fleur-de-lis blue and gold', 'frame': 'Quebec heritage border with Chateau Frontenac and fleur-de-lis corner accents', 'bg': 'deep Quebec French heritage blue with fleur-de-lis royal gold'},
}

def get_theme(series_name, venue_name, city, state):
    """Build venue/location-specific visual theme for logo prompt."""
    name_lower = (series_name or '').lower()
    venue_lower = (venue_name or '').lower()
    city_lower = (city or '').lower()
    state_upper = (state or '').upper()

    # Check venue keywords first (most specific)
    for keyword, theme in VENUE_THEMES.items():
        if keyword in venue_lower or keyword in name_lower:
            return theme

    # Fall back to state theme
    if state_upper in STATE_THEMES:
        return STATE_THEMES[state_upper]

    # Default Smarter.Poker metal theme
    return {
        'palette': 'neon cyan and gunmetal silver',
        'frame': 'industrial machined metal frame with corner bolt rivets and neon cyan accent strips',
        'bg': 'dark navy gunmetal (#0a0a15) with brushed metal texture'
    }

def format_guarantee(series):
    """Format guarantee text using correct rules."""
    name = series.get('series_name', '')
    total = series.get('total_guaranteed')
    main = series.get('main_event_guaranteed')
    events = series.get('total_events') or series.get('event_count') or 1

    # If series name already contains a dollar amount, use main event guarantee
    has_dollar_in_name = bool(re.search(r'\$\d+', name))

    if has_dollar_in_name and main:
        # Format as main event
        if main >= 1_000_000:
            return f"${main/1_000_000:.1f}M MAIN EVENT"
        return f"${int(main/1000)}K MAIN EVENT"
    elif total and events > 1:
        # Round DOWN to nearest clean number
        if total >= 1_000_000:
            rounded = int(total / 1_000_000) * 1_000_000
            return f"OVER ${rounded/1_000_000:.0f}M IN GUARANTEES"
        elif total >= 100_000:
            rounded = int(total / 100_000) * 100_000
            rounded_k = int(rounded / 1000)
            return f"OVER ${rounded_k}K IN GUARANTEES"
        elif total >= 10_000:
            rounded = int(total / 10_000) * 10_000
            rounded_k = int(rounded / 1000)
            return f"OVER ${rounded_k}K IN GUARANTEES"
        else:
            return f"OVER ${total:,} IN GUARANTEES"
    elif main:
        if main >= 1_000_000:
            return f"${main/1_000_000:.1f}M GTD"
        return f"${int(main/1000)}K GTD"
    else:
        return "TOURNAMENT SERIES"

def clean_name(name):
    """Strip HTML entities and year suffixes."""
    name = (name or '').replace('&#39;', "'").replace('&amp;', '&').replace('&amp;#39;', "'")
    name = re.sub(r"[\s\-]+['']?2[0-9]{1,3}\s*$", '', name).strip()
    name = re.sub(r"\s+20[0-9]{2}\s*$", '', name).strip()
    # Remove specific season/month refs that create date-specificity
    name = re.sub(r"\s*[-–]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*$", '', name, flags=re.I).strip()
    return name

def build_prompt(series):
    """Build DALL-E prompt for a series logo."""
    name = clean_name(series.get('series_name', ''))
    venue = (series.get('venue_name') or '').replace('&#39;', "'").replace('&amp;', '&')
    city = series.get('city') or ''
    state = series.get('state') or ''
    location = f"{city}, {state}" if city and state else (city or state or '')
    gtd = format_guarantee(series)

    theme = get_theme(series.get('series_name',''), venue, city, state)

    venue_line = f'"{venue.upper()}"' if venue else ''
    location_line = f'"{location}"' if location else ''
    gtd_badge = gtd if gtd != "TOURNAMENT SERIES" else "TOURNAMENT SERIES"
    badge_style = "glowing" if "GTD" in gtd or "GUARANTEES" in gtd else "classic"

    prompt = f"""Professional poker series logo, 640x640 square format.

SERIES: "{name}"
{f'VENUE: {venue_line}' if venue_line else ''}
{f'LOCATION: {location_line}' if location_line else ''}

UNIQUE VISUAL IDENTITY — {theme['bg']}
FRAME: {theme['frame']}
COLOR PALETTE: {theme['palette']}

TEXT LAYOUT:
- "{name}" — large bold embossed chrome/metallic text, dominant center-top
{f'- {venue_line} — glowing accent color, center middle' if venue_line else ''}
{f'- {location_line} — small white text below venue' if location_line else ''}
- Bottom badge ({badge_style}, shaped to match theme): "{gtd_badge}"
- Bottom right corner: small "SMARTER.POKER" watermark

The badge must say exactly: {gtd_badge}
Premium quality. Authentic venue character. NO dates. NO year numbers."""

    return prompt.strip()

def generate_logo_dalle(prompt, series_id, slug):
    """Generate logo via DALL-E 3 API."""
    headers = {
        'Authorization': f'Bearer {OPENAI_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'model': 'dall-e-3',
        'prompt': prompt,
        'n': 1,
        'size': '1024x1024',
        'quality': 'standard',
        'style': 'vivid'
    }
    resp = requests.post('https://api.openai.com/v1/images/generations',
                         headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"DALL-E error {resp.status_code}: {resp.text[:200]}")
    
    image_url = resp.json()['data'][0]['url']
    img_resp = requests.get(image_url, timeout=30)
    return img_resp.content

def upload_and_save(series_id, slug, img_bytes):
    """Upload logo to Supabase Storage and update DB."""
    path = f"{slug}.png"
    try:
        sb.storage.from_(BUCKET).upload(
            path, img_bytes,
            file_options={'content-type': 'image/png', 'upsert': 'true'}
        )
    except Exception as e:
        if 'already exists' in str(e).lower() or 'Duplicate' in str(e):
            sb.storage.from_(BUCKET).update(
                path, img_bytes,
                file_options={'content-type': 'image/png'}
            )
        else:
            raise

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    sb.table('poker_series').update({'logo_url': public_url}).eq('id', series_id).execute()
    return public_url

def slugify(text):
    text = (text or '').lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    return text[:80]

def is_tour(name):
    n = (name or '').lower()
    return any(k in n for k in TOUR_BLOCKLIST)

def main():
    print("="*60)
    print("🎴 Poker Series Logo Generator — Batch v1.0")
    print("="*60)

    # Load progress file to resume if interrupted
    progress_file = '/tmp/series_logo_progress.json'
    done_ids = set()
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            done_ids = set(json.load(f).get('done', []))
        print(f"📋 Resuming — {len(done_ids)} already completed")

    # Fetch all series needing logos
    all_series = []
    offset = 0
    while True:
        res = sb.table('poker_series').select(
            'id, series_name, venue_name, city, state, location, '
            'total_guaranteed, main_event_guaranteed, total_events, event_count, is_suppressed'
        ).range(offset, offset + 999).execute()
        if not res.data:
            break
        all_series.extend(res.data)
        if len(res.data) < 1000:
            break
        offset += 1000

    # Filter: no tours, no suppressed, not already done
    to_process = [
        s for s in all_series
        if not is_tour(s.get('series_name', ''))
        and not s.get('is_suppressed')
        and s['id'] not in done_ids
    ]

    print(f"📊 Total series: {len(all_series)}")
    print(f"✅ Already done: {len(done_ids)}")
    print(f"🔄 To generate: {len(to_process)}")
    print()

    success = 0
    failed = []

    for i, series in enumerate(to_process, 1):
        sid = series['id']
        name = clean_name(series.get('series_name', f'Series {sid}'))
        slug = slugify(name) or f'series-{sid}'
        
        print(f"[{i}/{len(to_process)}] {name} (ID:{sid})")
        
        try:
            prompt = build_prompt(series)
            img_bytes = generate_logo_dalle(prompt, sid, slug)
            url = upload_and_save(sid, slug, img_bytes)
            
            done_ids.add(sid)
            with open(progress_file, 'w') as f:
                json.dump({'done': list(done_ids)}, f)
            
            success += 1
            print(f"  ✅ {url}")
            
            # Rate limit: ~1 request/6s to stay within DALL-E limits
            time.sleep(6)

        except Exception as e:
            print(f"  ❌ FAILED: {e}")
            failed.append({'id': sid, 'name': name, 'error': str(e)})
            time.sleep(2)

    print()
    print("="*60)
    print(f"🎉 COMPLETE: {success} logos generated")
    print(f"❌ Failed: {len(failed)}")
    if failed:
        print("Failed series:")
        for f in failed:
            print(f"  [{f['id']}] {f['name']}: {f['error'][:80]}")
    print("="*60)

if __name__ == '__main__':
    main()
