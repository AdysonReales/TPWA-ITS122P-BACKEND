const pool = require('../config/db');
const fs = require('node:fs');
const path = require('node:path');

// Curated, reusable place recommendations. Each row is a real attraction or
// named experience, not a booking/vendor activity. Re-running this seed only
// upserts the same country/place/title keys; it never deletes existing data.
const PLACE_DATA = `
Argentina|Buenos Aires||Obelisco de Buenos Aires;Caminito in La Boca;Recoleta Cemetery;Teatro Colón Guided Tour;San Telmo Market
Australia|Sydney||Sydney Opera House Tour;Sydney Harbour BridgeClimb;Bondi to Coogee Coastal Walk;Royal Botanic Garden Sydney;Queen Victoria Building
Austria|Vienna||Schönbrunn Palace Tour;St. Stephen's Cathedral;Belvedere Palace;Naschmarkt Food Walk;MuseumsQuartier
Brazil|Rio de Janeiro||Christ the Redeemer;Sugarloaf Mountain Cable Car;Escadaria Selarón;Copacabana Beach;Maracanã Stadium Tour
Brunei|Bandar Seri Begawan||Sultan Omar Ali Saifuddien Mosque;Kampong Ayer Water Village;Royal Regalia Museum;Jame' Asr Hassanil Bolkiah Mosque;Ulu Temburong National Park
Cambodia|Siem Reap|Siem Reap (Angkor)|Angkor Wat Sunrise Visit;Bayon Temple at Angkor Thom;Ta Prohm Temple;Angkor National Museum;Phare, The Cambodian Circus
Canada|Vancouver||Stanley Park Seawall;Capilano Suspension Bridge Park;Granville Island Public Market;Vancouver Art Gallery;Grouse Mountain Skyride
China|Beijing||Mutianyu Great Wall Excursion;Forbidden City Palace Museum;Summer Palace Boat Ride;Temple of Heaven;Wangfujing Snack Street
China|Chengdu||Chengdu Research Base of Giant Panda Breeding;Wuhou Shrine Museum;Jinli Ancient Street Food Walk;People's Park Tea House;Dujiangyan Irrigation System
China|Shanghai||The Bund and Huangpu River Promenade;Yu Garden;Shanghai Museum;Jade Buddha Temple;Nanjing Road Walking Tour
Cook Islands|Aitutaki|Cook Islands|Aitutaki Lagoon Cruise;One Foot Island Visit;Muri Lagoon Kayaking;Te Rua Manga (The Needle) Hike;Punanga Nui Market
Croatia|Dubrovnik||Dubrovnik City Walls Walk;Rector's Palace Museum;Lokrum Island Ferry and Nature Reserve;Stradun Old Town Walk;Mount Srđ Cable Car
Czech Republic|Prague||Charles Bridge Sunrise Walk;Prague Castle Circuit;Old Town Astronomical Clock;Jewish Quarter Museum Tour;Prašná brána (Powder Tower)
Denmark|Copenhagen||Tivoli Gardens;Nyhavn Harbor Walk;Rosenborg Castle;National Museum of Denmark;Torvehallerne Food Market
Egypt|Cairo||Giza Pyramids and Sphinx;Egyptian Museum;Khan el-Khalili Bazaar;Citadel of Saladin;Al-Muizz Street Heritage Walk
Eswatini|Ezulwini Valley|Eswatini|Mantenga Cultural Village;Mlilwane Wildlife Sanctuary;Sibebe Rock Hike;Hlane Royal National Park;Ngwenya Glass Factory Visit
Fiji|Nadi||Garden of the Sleeping Giant;Sri Siva Subramaniya Temple;Sabeto Hot Springs and Mud Pool;Nadi Market;Mamanuca Islands Day Cruise
France|Paris||Eiffel Tower Summit Visit;Louvre Museum Highlights Tour;Sainte-Chapelle;Montmartre and Sacré-Cœur Walk;Marché des Enfants Rouges Food Visit
Germany|Berlin||Brandenburg Gate and Reichstag Walk;Berlin Wall Memorial;Museum Island;East Side Gallery;Markthalle Neun Food Market
Greece|Athens||Acropolis and Parthenon Visit;Acropolis Museum;Ancient Agora of Athens;Plaka Neighborhood Walk;Varvakios Central Market
Hong Kong|Hong Kong||Victoria Peak Tram and Sky Terrace;Star Ferry Harbor Crossing;Tian Tan Buddha and Ngong Ping;Temple Street Night Market;M+ Museum
Hungary|Budapest||Hungarian Parliament Guided Visit;Széchenyi Thermal Bath;Buda Castle District Walk;Great Market Hall;Fisherman's Bastion
Iceland|Reykjavik||Hallgrímskirkja Tower Visit;Harpa Concert Hall;Perlan Wonders of Iceland;National Museum of Iceland;Reykjavík Old Harbor Walk
Indonesia|Bali||Uluwatu Temple Kecak Performance;Tegallalang Rice Terraces;Sacred Monkey Forest Sanctuary;Tanah Lot Sunset Visit;Mount Batur Sunrise Trek
Indonesia|Jakarta||National Monument (Monas) Observation Deck;Kota Tua Jakarta Heritage Walk;Istiqlal Mosque and Jakarta Cathedral;National Museum of Indonesia;Thousand Islands Day Cruise
Indonesia|Yogyakarta||Borobudur Temple Sunrise Visit;Prambanan Temple Complex;Kraton Yogyakarta Palace;Taman Sari Water Castle;Malioboro Street Food Walk
Ireland|Dublin||Book of Kells at Trinity College;Kilmainham Gaol Tour;Guinness Storehouse;National Museum of Ireland – Archaeology;Temple Bar Food and Music Walk
Italy|Rome||Colosseum and Roman Forum;Vatican Museums and Sistine Chapel;Pantheon of Rome;Borghese Gallery;Campo de' Fiori Market
Japan|Tokyo||Shibuya Crossing;Sensō-ji Temple in Asakusa;Tokyo Skytree Observatory;Meiji Jingu Shrine;Tsukiji Outer Market Food Walk
Japan|Kyoto||Fushimi Inari Taisha;Kinkaku-ji (Golden Pavilion);Arashiyama Bamboo Grove;Nishiki Market;Kiyomizu-dera Temple
Japan|Osaka||Osaka Castle;Dōtonbori Canal Walk;Universal Studios Japan;Kuromon Ichiba Market;Umeda Sky Building Observatory
Macau|Macau|Macao|Ruins of St. Paul's;Senado Square;A-Ma Temple;Taipa Village Food Walk;Macau Tower Observation Deck
Malaysia|Kuala Lumpur||Petronas Twin Towers Skybridge;Batu Caves;Islamic Arts Museum Malaysia;Jalan Alor Food Street;Central Market Kuala Lumpur
Malaysia|Penang|George Town|Kek Lok Si Temple;Penang Hill Funicular Railway;George Town UNESCO Heritage Walk;Clan Jetties of Chew;Gurney Drive Hawker Centre
Mexico|Mexico City||Museo Nacional de Antropología;Templo Mayor Museum;Chapultepec Castle;Palacio de Bellas Artes;Mercado de Coyoacán
Morocco|Marrakech||Jemaa el-Fnaa;Bahia Palace;Ben Youssef Madrasa;Majorelle Garden;Marrakech Medina Souk Walk
Netherlands|Amsterdam||Rijksmuseum;Anne Frank House;Van Gogh Museum;Jordaan Canal Walk;Albert Cuyp Market
New Zealand|Queenstown||Skyline Queenstown Gondola;TSS Earnslaw Lake Cruise;Shotover Jet;Queenstown Gardens;Ben Lomond Track
Norway|Oslo||Vigeland Sculpture Park;Munch Museum;Akershus Fortress;Oslo Opera House Roof Walk;Mathallen Food Hall
Peru|Cusco|Cusco (Machu Picchu)|Machu Picchu Citadel Visit;Sacsayhuamán Archaeological Park;Qorikancha Temple;San Pedro Market;Cusco Cathedral
Philippines|Manila||Intramuros Heritage Walk;National Museum of Fine Arts;Fort Santiago;Rizal Park;Binondo Food Crawl
Philippines|Baguio||Mines View Park;BenCab Museum;Burnham Park Boat Ride;Tam-awan Village;Baguio Botanical Garden
Philippines|Bohol|Bohol Island~Panglao|Chocolate Hills Viewpoint;Philippine Tarsier Sanctuary;Loboc River Cruise;Baclayon Church Museum;Panglao Island and Balicasag Snorkeling
Philippines|Cebu City|Cebu|Magellan's Cross and Basilica del Santo Niño;Fort San Pedro;Temple of Leah;Kawasan Falls Canyoneering;Cebu Taoist Temple
Philippines|Coron, Palawan|Coron|Kayangan Lake Swim and Viewpoint;Twin Lagoon Boat and Snorkel Tour;Barracuda Lake Freedive;Maquinit Hot Springs;Coron WWII Shipwreck Snorkeling
Philippines|El Nido, Palawan|El Nido|Big Lagoon Kayak Tour;Small Lagoon Paddle Tour;Nacpan Beach;Matinloc Shrine and Secret Beach;Seven Commandos Beach Island Hopping
Portugal|Lisbon||Jerónimos Monastery;Belém Tower;São Jorge Castle;Time Out Market Lisboa;Alfama Tram and Fado Walk
Qatar|Doha||Museum of Islamic Art;National Museum of Qatar;Souq Waqif;Katara Cultural Village;Doha Corniche Walk
Singapore|Singapore||Gardens by the Bay Cloud Forest;Marina Bay Sands SkyPark;Singapore Botanic Gardens;Maxwell Food Centre;National Gallery Singapore
South Africa|Cape Town||Table Mountain Aerial Cableway;Robben Island Museum Tour;Kirstenbosch National Botanical Garden;Bo-Kaap Heritage Walk;V&A Waterfront Food Market
South Korea|Seoul||Gyeongbokgung Palace;Bukchon Hanok Village;N Seoul Tower;Gwangjang Market Food Walk;National Museum of Korea
South Korea|Busan||Haeundae Beach;Gamcheon Culture Village;Haedong Yonggungsa Temple;Jagalchi Fish Market;Taejongdae Coastal Walk
South Korea|Jeju Island|Jeju~Jeju-si|Seongsan Ilchulbong Sunrise Peak;Manjanggul Lava Tube;Hallasan National Park;Seopjikoji Coastal Walk;Jeju Folk Village
Spain|Barcelona||Sagrada Família;Park Güell;Casa Batlló;Mercat de la Boqueria;Barri Gòtic Walking Tour
Sweden|Stockholm||Vasa Museum;Gamla Stan Old Town Walk;Skansen Open-Air Museum;Fotografiska;Östermalms Saluhall Food Hall
Switzerland|Zurich||Kunsthaus Zürich;Fraumünster Church;Uetliberg Mountain Trail;Swiss National Museum;Zürich Old Town and Lindenhof Walk
Taiwan|Taipei||Taipei 101 Observatory;National Palace Museum;Longshan Temple;Shilin Night Market;Elephant Mountain Hiking Trail
Thailand|Bangkok||Grand Palace and Wat Phra Kaew;Wat Arun;Jim Thompson House Museum;Chatuchak Weekend Market;Yaowarat Street Food Walk
Thailand|Chiang Mai||Wat Phra That Doi Suthep;Chiang Mai Old City Temple Walk;Doi Inthanon National Park;Elephant Nature Park Visit;Warorot Market Food Walk
Thailand|Phuket||Phi Phi Islands Day Cruise;Big Buddha Phuket;Wat Chalong;Phang Nga Bay Sea Cave Canoe;Phuket Old Town Heritage and Food Walk
Turkey|Istanbul||Hagia Sophia;Topkapı Palace Museum;Basilica Cistern;Grand Bazaar;Bosphorus Ferry Cruise
United Arab Emirates|Dubai||Burj Khalifa At the Top;Al Fahidi Historical Neighbourhood;Dubai Museum at Al Shindagha;Dubai Creek Abra Ride;Dubai Spice Souk
United Kingdom|London||Tower of London;Westminster Abbey;British Museum;Borough Market;Thames River Sightseeing Cruise
United States|New York City|New York~New York City|Statue of Liberty and Ellis Island;Metropolitan Museum of Art;Central Park Conservancy Walk;9/11 Memorial and Museum;Chelsea Market Food Hall
Vietnam|Hanoi||Temple of Literature;Ho Chi Minh Mausoleum;Thăng Long Imperial Citadel;Hanoi Old Quarter Food Walk;Hoàn Kiếm Lake
Vietnam|Da Nang||Marble Mountains Cave and Pagoda Walk;Ba Na Hills Golden Bridge;My Khe Beach;Son Tra Peninsula and Linh Ung Pagoda;Han Market Food Walk
Vietnam|Ho Chi Minh City|Ho Chi Minh|War Remnants Museum;Cu Chi Tunnels Day Visit;Reunification Palace;Ben Thanh Market Food Walk;Saigon Central Post Office
`.trim();

function classify(title) {
  if (/market|food|street food/i.test(title)) return ['Food', 'Food'];
  if (/beach|park|garden|island|mountain|hike|trail|nature|terrace|lake/i.test(title)) return ['Nature', 'Nature'];
  if (/museum|temple|mosque|cathedral|palace|heritage|historic|old town|fort|church|monastery|village|memorial/i.test(title)) return ['Culture', 'Culture'];
  if (/cruise|cable car|gondola|jet|performance|skyride|observatory|tower|tram/i.test(title)) return ['Recreation', 'Recreation'];
  return ['Landmark', 'Sightseeing'];
}

function parseRows() {
  return PLACE_DATA.split(/\r?\n/).map((line) => {
    const [country, destinationName, aliasText, titleText] = line.split('|');
    const aliases = (aliasText || '').split('~').map((value) => value.trim()).filter(Boolean);
    return titleText.split(';').map((rawTitle) => {
      const title = rawTitle.trim();
      const [category, categoryType] = classify(title);
      return { country, destinationName, aliases, title, category, categoryType };
    });
  }).flat();
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const migrationPath = path.join(__dirname, '../sql/migrations/20261007_activity_recommendations.up.sql');
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    const recommendations = parseRows();
    for (const item of recommendations) {
      await client.query(
        `INSERT INTO activity_recommendations
           (country, destination_name, destination_aliases, title, category, category_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (
           LOWER(country),
           REGEXP_REPLACE(LOWER(destination_name), '[^a-z0-9]+', '', 'g'),
           REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '', 'g')
         ) DO UPDATE SET
           destination_aliases = EXCLUDED.destination_aliases,
           category = EXCLUDED.category,
           category_type = EXCLUDED.category_type,
           updated_at = NOW()`,
        [item.country, item.destinationName, item.aliases, item.title, item.category, item.categoryType]
      );
    }
    await client.query('COMMIT');
    console.log(`Upserted ${recommendations.length} destination activity recommendations across ${PLACE_DATA.split(/\r?\n/).length} places.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Could not seed activity recommendations:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { PLACE_DATA, parseRows, classify };
