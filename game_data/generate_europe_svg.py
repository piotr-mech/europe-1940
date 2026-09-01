import csv, json, math, os, re, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

import geopandas as gpd
from countryinfo import CountryInfo
from pyproj import Transformer
from shapely.geometry import shape, box, Point, MultiPoint, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import transform as shp_transform, unary_union, nearest_points
from shapely import make_valid, voronoi_polygons

OUT = Path('/mnt/data')
SVG_PATH = OUT / 'europa_regiony.svg'
CSV_PATH = OUT / 'miasta_regionow.csv'
REGIONS_CSV_PATH = OUT / 'regiony.csv'
README_PATH = OUT / 'README_mapa.txt'
ZIP_PATH = OUT / 'europa_svg_csv.zip'
PREVIEW_PATH = OUT / 'europa_regiony_preview.png'

# Zakres mapy: Europa + Turcja, Cypr i Kaukaz; bez odleglych terytoriow zamorskich.
LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = -25.0, 52.0, 34.0, 72.5
WGS_CLIP = box(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX)

# Szerokosc/wysokosc SVG.
SVG_W, SVG_H, MARGIN = 1800, 1200, 42

# Polska nazwa, klucz CountryInfo (None = geometria uzupelniona), ISO3, przyblizona powierzchnia gdy potrzebna.
COUNTRIES = [
    ('Albania', 'albania', 'ALB', None),
    ('Andora', None, 'AND', 468),
    ('Armenia', 'armenia', 'ARM', None),
    ('Austria', 'austria', 'AUT', None),
    ('Azerbejdżan', 'azerbaijan', 'AZE', None),
    ('Białoruś', 'belarus', 'BLR', None),
    ('Belgia', 'belgium', 'BEL', None),
    ('Bośnia i Hercegowina', 'bosnia and herzegovina', 'BIH', None),
    ('Bułgaria', 'bulgaria', 'BGR', None),
    ('Chorwacja', 'croatia', 'HRV', None),
    ('Cypr', 'cyprus', 'CYP', None),
    ('Czechy', 'czech republic', 'CZE', None),
    ('Dania', 'denmark', 'DNK', None),
    ('Estonia', 'estonia', 'EST', None),
    ('Finlandia', 'finland', 'FIN', None),
    ('Francja', 'france', 'FRA', None),
    ('Gruzja', 'georgia', 'GEO', None),
    ('Niemcy', 'germany', 'DEU', None),
    ('Grecja', 'greece', 'GRC', None),
    ('Węgry', 'hungary', 'HUN', None),
    ('Islandia', 'iceland', 'ISL', None),
    ('Irlandia', 'ireland', 'IRL', None),
    ('Włochy', 'italy', 'ITA', None),
    ('Kosowo', None, 'XKX', 10887),
    ('Łotwa', 'latvia', 'LVA', None),
    ('Liechtenstein', None, 'LIE', 160),
    ('Litwa', 'lithuania', 'LTU', None),
    ('Luksemburg', 'luxembourg', 'LUX', None),
    ('Malta', 'malta', 'MLT', None),
    ('Mołdawia', 'moldova', 'MDA', None),
    ('Monako', None, 'MCO', 2.02),
    ('Czarnogóra', None, 'MNE', 13812),
    ('Niderlandy', 'netherlands', 'NLD', None),
    ('Macedonia Północna', 'republic of macedonia', 'MKD', None),
    ('Norwegia', 'norway', 'NOR', None),
    ('Polska', 'poland', 'POL', None),
    ('Portugalia', 'portugal', 'PRT', None),
    ('Rumunia', 'romania', 'ROU', None),
    ('Rosja', 'russia', 'RUS', None),
    ('San Marino', None, 'SMR', 61),
    ('Serbia', None, 'SRB', 77474),
    ('Słowacja', 'slovakia', 'SVK', None),
    ('Słowenia', 'slovenia', 'SVN', None),
    ('Hiszpania', 'spain', 'ESP', None),
    ('Szwecja', 'sweden', 'SWE', None),
    ('Szwajcaria', 'switzerland', 'CHE', None),
    ('Turcja', 'turkey', 'TUR', None),
    ('Ukraina', 'ukraine', 'UKR', None),
    ('Wielka Brytania', 'united kingdom', 'GBR', None),
    ('Watykan', None, 'VAT', 0.49),
]

# Miasta-seedy dla krajow dzielonych na wiele czesci: (nazwa, lon, lat)
MULTI_CITIES = {
    'RUS': [
        ('Moskwa', 37.6173, 55.7558), ('Sankt Petersburg', 30.3351, 59.9343),
        ('Niżny Nowogród', 44.0060, 56.3269), ('Kazań', 49.1064, 55.7961),
        ('Rostów nad Donem', 39.7015, 47.2357), ('Wołgograd', 44.5169, 48.7080),
    ],
    'TUR': [
        ('Stambuł', 28.9784, 41.0082), ('Ankara', 32.8597, 39.9334),
        ('Izmir', 27.1428, 38.4237), ('Bursa', 29.0609, 40.1950),
        ('Antalya', 30.7133, 36.8969),
    ],
    'FRA': [('Paryż', 2.3522, 48.8566), ('Lyon', 4.8357, 45.7640), ('Marsylia', 5.3698, 43.2965), ('Bordeaux', -0.5792, 44.8378)],
    'DEU': [('Berlin', 13.4050, 52.5200), ('Hamburg', 9.9937, 53.5511), ('Monachium', 11.5820, 48.1351), ('Frankfurt nad Menem', 8.6821, 50.1109)],
    'GBR': [('Londyn', -0.1276, 51.5072), ('Birmingham', -1.8904, 52.4862), ('Manchester', -2.2426, 53.4808), ('Glasgow', -4.2518, 55.8642)],
    'ESP': [('Madryt', -3.7038, 40.4168), ('Barcelona', 2.1734, 41.3851), ('Walencja', -0.3763, 39.4699), ('Sewilla', -5.9845, 37.3891)],
    'SWE': [('Sztokholm', 18.0686, 59.3293), ('Göteborg', 11.9746, 57.7089), ('Malmö', 13.0038, 55.6050), ('Umeå', 20.2630, 63.8258)],
    'UKR': [('Kijów', 30.5234, 50.4501), ('Lwów', 24.0316, 49.8429), ('Odessa', 30.7233, 46.4825), ('Charków', 36.2304, 49.9935)],
    'NOR': [('Oslo', 10.7522, 59.9139), ('Bergen', 5.3221, 60.3930), ('Trondheim', 10.3951, 63.4305)],
    'FIN': [('Helsinki', 24.9384, 60.1699), ('Tampere', 23.7610, 61.4978), ('Oulu', 25.4651, 65.0121)],
    'ITA': [('Rzym', 12.4964, 41.9028), ('Mediolan', 9.1900, 45.4642), ('Neapol', 14.2681, 40.8518)],
    'POL': [('Warszawa', 21.0122, 52.2297), ('Kraków', 19.9450, 50.0647), ('Gdańsk', 18.6466, 54.3520)],
    'ROU': [('Bukareszt', 26.1025, 44.4268), ('Kluż-Napoka', 23.6236, 46.7712), ('Jassy', 27.6014, 47.1585)],
    'BLR': [('Mińsk', 27.5615, 53.9045), ('Brześć', 23.6877, 52.0976), ('Homel', 30.9754, 52.4345)],
    'GRC': [('Ateny', 23.7275, 37.9838), ('Saloniki', 22.9444, 40.6401)],
    'BGR': [('Sofia', 23.3219, 42.6977), ('Warna', 27.9147, 43.2141)],
    'ISL': [('Reykjavík', -21.9426, 64.1466), ('Akureyri', -18.0907, 65.6826)],
}

# Reczne stolice/koordynaty dla uzupelnien i czytelne polskie nazwy dla panstw 1-obszarowych.
CAPITAL_OVERRIDES = {
    'ALB': ('Tirana', 19.8187, 41.3275), 'AND': ('Andora', 1.5218, 42.5063),
    'ARM': ('Erywań', 44.5152, 40.1872), 'AUT': ('Wiedeń', 16.3738, 48.2082),
    'AZE': ('Baku', 49.8671, 40.4093), 'BEL': ('Bruksela', 4.3517, 50.8503),
    'BIH': ('Sarajewo', 18.4131, 43.8563), 'HRV': ('Zagrzeb', 15.9819, 45.8150),
    'CYP': ('Nikozja', 33.3823, 35.1856), 'CZE': ('Praga', 14.4378, 50.0755),
    'DNK': ('Kopenhaga', 12.5683, 55.6761), 'EST': ('Tallinn', 24.7536, 59.4370),
    'GEO': ('Tbilisi', 44.8271, 41.7151), 'HUN': ('Budapeszt', 19.0402, 47.4979),
    'IRL': ('Dublin', -6.2603, 53.3498), 'XKX': ('Prisztina', 21.1655, 42.6629),
    'LVA': ('Ryga', 24.1052, 56.9496), 'LIE': ('Vaduz', 9.5209, 47.1410),
    'LTU': ('Wilno', 25.2797, 54.6872), 'LUX': ('Luksemburg', 6.1319, 49.6116),
    'MLT': ('Valletta', 14.5146, 35.8989), 'MDA': ('Kiszyniów', 28.8353, 47.0105),
    'MCO': ('Monako', 7.4246, 43.7384), 'MNE': ('Podgorica', 19.2629, 42.4304),
    'NLD': ('Amsterdam', 4.9041, 52.3676), 'MKD': ('Skopje', 21.4314, 41.9981),
    'PRT': ('Lizbona', -9.1393, 38.7223), 'SMR': ('San Marino', 12.4578, 43.9424),
    'SRB': ('Belgrad', 20.4489, 44.7866), 'SVK': ('Bratysława', 17.1077, 48.1486),
    'SVN': ('Lublana', 14.5058, 46.0569), 'CHE': ('Berno', 7.4474, 46.9480),
    'VAT': ('Watykan', 12.4534, 41.9029),
}

# Geometrie mikropanstw sa celowo powiekszone jako znaczniki kartograficzne, aby byly klikalne/widoczne.
MICROSTATES = {
    'AND': (1.5218, 42.5063, 26000),
    'LIE': (9.5209, 47.1410, 19000),
    'MCO': (7.4246, 43.7384, 15000),
    'SMR': (12.4578, 43.9424, 16000),
    'VAT': (12.4534, 41.9029, 12000),
}

PALETTE = ['#d8e6f3','#f2dfd8','#e3ead3','#eadcf1','#f2ebc8','#d9ece6','#ecdcca','#d9dff0','#e9e2d4','#dcead8','#f0dbe2','#dbe9ee']

def count_regions(area_km2, iso3):
    # Regula dopasowana do przykladow uzytkownika:
    # <100k = 1, 100-200k = 2, 200-350k = 3, 350-650k = 4, 650k-1m = 5, >=1m = 6.
    # Wielka Brytania ma wskazany przez uzytkownika wyjatek = 4.
    if iso3 == 'GBR': return 4
    if iso3 in ('LTU','LVA','EST'): return 1
    if area_km2 < 100000: return 1
    if area_km2 < 200000: return 2
    if area_km2 < 350000: return 3
    if area_km2 < 650000: return 4
    if area_km2 < 1000000: return 5
    return 6

def polygonal(g):
    if g is None or g.is_empty:
        return None
    g = make_valid(g)
    if isinstance(g, (Polygon, MultiPolygon)):
        return g
    if isinstance(g, GeometryCollection):
        polys = [x for x in g.geoms if isinstance(x, (Polygon, MultiPolygon)) and not x.is_empty]
        return unary_union(polys) if polys else None
    return None

def slug(s):
    import unicodedata
    z = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode('ascii').lower()
    z = re.sub(r'[^a-z0-9]+','-',z).strip('-')
    return z or 'region'

# Dane CountryInfo.
allc = CountryInfo().all()

# Natural Earth lowres z pakietu pyogrio jako uzupelnienie dla Serbii/Czarnogory/Kosowa.
lowres_path = '/opt/pyvenv/lib/python3.13/site-packages/pyogrio/tests/fixtures/naturalearth_lowres/naturalearth_lowres.shp'
low = gpd.read_file(lowres_path)
low_name = {row['name']: row.geometry for _, row in low.iterrows()}

local_geom = {
    'SRB': low_name.get('Serbia'),
    'MNE': low_name.get('Montenegro'),
    'XKX': low_name.get('Kosovo'),
}

tr = Transformer.from_crs('EPSG:4326','EPSG:3035',always_xy=True)

def project(g): return shp_transform(tr.transform, g)

def countryinfo_geom(key):
    d = allc.get(key)
    if not d: return None
    gj = d.get('geoJSON') or {}
    feats = gj.get('features') or []
    geoms = []
    for feat in feats:
        try:
            geoms.append(shape(feat['geometry']))
        except Exception:
            pass
    if not geoms: return None
    return polygonal(unary_union(geoms))

country_records = []
for pl_name, key, iso3, area_override in COUNTRIES:
    area = area_override
    geom_wgs = None
    if key:
        d = allc.get(key) or {}
        if area is None: area = float(d.get('area') or 0)
        geom_wgs = countryinfo_geom(key)
    elif iso3 in local_geom:
        geom_wgs = local_geom[iso3]
    if area is None or area == 0:
        area = {'SRB':77474,'MNE':13812,'XKX':10887}.get(iso3,1)
    # Normalne kraje: przytnij do zakresu i rzutuj.
    geom_proj = None
    if geom_wgs is not None:
        clipped = polygonal(geom_wgs.intersection(WGS_CLIP))
        if clipped is not None and not clipped.is_empty:
            geom_proj = polygonal(project(clipped))
    country_records.append({'country':pl_name,'key':key,'iso3':iso3,'area_km2':area,'geom_proj':geom_proj})

# Powiekszone mikropanstwa jako bufory w projekcji europejskiej.
for rec in country_records:
    iso = rec['iso3']
    if iso in MICROSTATES:
        lon,lat,r = MICROSTATES[iso]
        x,y = tr.transform(lon,lat)
        rec['geom_proj'] = Point(x,y).buffer(r, resolution=24)

# Sprawdz geometrie.
missing = [r['iso3'] for r in country_records if r['geom_proj'] is None or r['geom_proj'].is_empty]
if missing:
    raise RuntimeError(f'Brak geometrii: {missing}')

# Uproszczenie dla rozmiaru SVG (zachowuje topologie).
for rec in country_records:
    rec['geom_proj'] = polygonal(rec['geom_proj'].simplify(2500, preserve_topology=True))

# Dopasowanie mapy do SVG.
all_union = unary_union([r['geom_proj'] for r in country_records])
minx,miny,maxx,maxy = all_union.bounds
avail_w, avail_h = SVG_W-2*MARGIN, SVG_H-2*MARGIN
scale = min(avail_w/(maxx-minx), avail_h/(maxy-miny))
used_w, used_h = (maxx-minx)*scale, (maxy-miny)*scale
xoff = MARGIN + (avail_w-used_w)/2
yoff = MARGIN + (avail_h-used_h)/2

def to_svg_xy(x,y):
    return xoff + (x-minx)*scale, yoff + (maxy-y)*scale

# Stolica z CountryInfo, gdy nie ma override.
def capital_for(rec):
    iso = rec['iso3']
    if iso in CAPITAL_OVERRIDES:
        return CAPITAL_OVERRIDES[iso]
    key = rec['key']
    d = allc.get(key) if key else None
    if d:
        cap = d.get('capital') or rec['country']
        ll = d.get('capital_latlng') or d.get('latlng')
        if ll and len(ll) >= 2:
            return cap, float(ll[1]), float(ll[0])
    # fallback representative point -> lon/lat unavailable; should rarely happen.
    p = rec['geom_proj'].representative_point()
    inv = Transformer.from_crs('EPSG:3035','EPSG:4326',always_xy=True)
    lon,lat = inv.transform(p.x,p.y)
    return rec['country'],lon,lat

# Tworzenie regionow Voronoi wokol miast.
regions = []
for cidx, rec in enumerate(country_records):
    iso = rec['iso3']
    n = count_regions(rec['area_km2'], iso)
    if n > 1:
        cities = MULTI_CITIES.get(iso)
        if not cities or len(cities) != n:
            raise RuntimeError(f'{iso}: oczekiwano {n} miast, jest {0 if not cities else len(cities)}')
    else:
        cities = [capital_for(rec)]
    seeds = []
    for city, lon, lat in cities:
        x,y = tr.transform(lon,lat)
        p = Point(x,y)
        # Jesli punkt minimalnie wypada poza uproszczona geometrie, dosun go do kraju dla diagramu.
        if not rec['geom_proj'].covers(p):
            p_near = nearest_points(rec['geom_proj'], p)[0]
            # zachowaj prawdziwe wspolrzedne miasta osobno, ale seed do podzialu dosun.
            seed = p_near
        else:
            seed = p
        seeds.append((city, lon, lat, p, seed))
    if n == 1:
        cells = [rec['geom_proj']]
    else:
        mp = MultiPoint([s[4] for s in seeds])
        ext = rec['geom_proj'].envelope.buffer(400000)
        vd = voronoi_polygons(mp, extend_to=ext, ordered=True)
        cells = [polygonal(cell.intersection(rec['geom_proj'])) for cell in vd.geoms]
    for ridx, (seed_data, cell) in enumerate(zip(seeds,cells), start=1):
        city, lon, lat, city_point, seed_point = seed_data
        if cell is None or cell.is_empty:
            raise RuntimeError(f'Pusty region {iso}-{ridx}')
        region_id = f'{iso.lower()}-r{ridx}'
        region_name = rec['country'] if n == 1 else f'Region {city}'
        rp = cell.representative_point()
        regions.append({
            'country':rec['country'],'iso3':iso,'country_idx':cidx,'region_index':ridx,'region_count':n,
            'region_id':region_id,'region_name':region_name,'city':city,'lon':lon,'lat':lat,
            'city_proj':city_point,'label_proj':rp,'geometry':cell,'area_km2_country':rec['area_km2']
        })

# Kolor kraju; warianty regionow przez przezroczystosc/rozjasnienie w SVG.
def hex_to_rgb(h):
    h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def rgb_to_hex(rgb): return '#%02x%02x%02x' % tuple(max(0,min(255,int(v))) for v in rgb)
def vary_color(base, idx, n):
    r,g,b = hex_to_rgb(base)
    if n <= 1: return base
    # subtelna roznica jasnosci miedzy czesciami
    delta = (idx-(n+1)/2)*8
    return rgb_to_hex((r+delta,g+delta,b+delta))

# Path SVG.
def ring_path(coords):
    pts=[to_svg_xy(x,y) for x,y in coords]
    if not pts: return ''
    s=f'M {pts[0][0]:.2f},{pts[0][1]:.2f}'
    for x,y in pts[1:]: s += f' L {x:.2f},{y:.2f}'
    return s+' Z'

def geom_path(g):
    if isinstance(g, Polygon):
        parts=[ring_path(g.exterior.coords)] + [ring_path(r.coords) for r in g.interiors]
        return ' '.join(p for p in parts if p)
    if isinstance(g, MultiPolygon):
        return ' '.join(geom_path(p) for p in g.geoms)
    return ''

# CSV miasta.
city_rows=[]
for r in regions:
    x,y=to_svg_xy(r['city_proj'].x,r['city_proj'].y)
    city_rows.append({
        'country_iso3':r['iso3'],'country':r['country'],'region_id':r['region_id'],'region_name':r['region_name'],
        'city':r['city'],'longitude':f"{r['lon']:.6f}",'latitude':f"{r['lat']:.6f}",
        'svg_x':f"{x:.2f}",'svg_y':f"{y:.2f}",'svg_width':SVG_W,'svg_height':SVG_H,
        'coordinate_note':'SVG: origin top-left; x right; y down'
    })
with CSV_PATH.open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(city_rows[0].keys()),delimiter=';')
    w.writeheader(); w.writerows(city_rows)

# CSV regiony (bonus: latwe mapowanie path ID <-> miasto).
region_rows=[]
for r in regions:
    lp=to_svg_xy(r['label_proj'].x,r['label_proj'].y)
    cp=to_svg_xy(r['city_proj'].x,r['city_proj'].y)
    region_rows.append({
        'region_id':r['region_id'],'country_iso3':r['iso3'],'country':r['country'],'region_index':r['region_index'],
        'region_count_country':r['region_count'],'region_name':r['region_name'],'main_city':r['city'],
        'label_svg_x':f'{lp[0]:.2f}','label_svg_y':f'{lp[1]:.2f}','city_svg_x':f'{cp[0]:.2f}','city_svg_y':f'{cp[1]:.2f}'
    })
with REGIONS_CSV_PATH.open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(region_rows[0].keys()),delimiter=';')
    w.writeheader(); w.writerows(region_rows)

# SVG.
parts=[]
parts.append(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_W}" height="{SVG_H}" viewBox="0 0 {SVG_W} {SVG_H}">
<metadata>
  <title>Współczesna mapa Europy — syntetyczne regiony według wielkości państw</title>
  <desc>Każdy region jest osobnym elementem path z id region_id. Miasta główne są w grupie city-points; ich współrzędne są również w pliku miasta_regionow.csv. Mikropaństwa AND/LIE/MCO/SMR/VAT są celowo powiększone jako znaczniki kartograficzne.</desc>
</metadata>
<style>
  .sea {{ fill:#f7fafc; }}
  .region {{ stroke:#ffffff; stroke-width:1.15; stroke-linejoin:round; fill-rule:evenodd; vector-effect:non-scaling-stroke; }}
  .country-outline {{ fill:none; stroke:#3f4a55; stroke-width:1.6; stroke-linejoin:round; fill-rule:evenodd; vector-effect:non-scaling-stroke; pointer-events:none; }}
  .city-dot {{ fill:#17202a; stroke:#ffffff; stroke-width:1.1; vector-effect:non-scaling-stroke; }}
  .region-label {{ font-family:Arial,DejaVu Sans,sans-serif; font-size:8.5px; font-weight:600; text-anchor:middle; fill:#17202a; stroke:none; }}
  .city-label {{ font-family:Arial,DejaVu Sans,sans-serif; font-size:8.5px; font-weight:bold; text-anchor:middle; fill:#111820; paint-order:stroke; stroke:#ffffff; stroke-width:1.5px; stroke-linejoin:round; }}
  .micro-label {{ font-size:7.5px; }}
  .legend {{ font-family:Arial,DejaVu Sans,sans-serif; fill:#263238; }}
</style>
<rect class="sea" x="0" y="0" width="{SVG_W}" height="{SVG_H}"/>
<g id="regions">''')

# Region paths: sort big countries first and microstates last to keep them visible.
country_area_sort={r['iso3']: r['area_km2'] for r in country_records}
for r in sorted(regions, key=lambda z: (country_area_sort[z['iso3']], z['region_index']), reverse=True):
    cidx=r['country_idx']; base=PALETTE[cidx%len(PALETTE)]
    fill=vary_color(base,r['region_index'],r['region_count'])
    d=geom_path(r['geometry'])
    title=f"{r['country']} — {r['region_name']}; główne miasto: {r['city']}"
    parts.append(f'<path id="{r["region_id"]}" class="region" data-country="{escape(r["country"])}" data-iso3="{r["iso3"]}" data-region-name="{escape(r["region_name"])}" data-main-city="{escape(r["city"])}" fill="{fill}" d="{d}"><title>{escape(title)}</title></path>')
parts.append('</g>\n<g id="country-outlines">')
for rec in country_records:
    parts.append(f'<path id="outline-{rec["iso3"].lower()}" class="country-outline" d="{geom_path(rec["geom_proj"])}"/>')
parts.append('</g>')

# Miasta.
parts.append('<g id="city-points">')
for r in regions:
    x,y=to_svg_xy(r['city_proj'].x,r['city_proj'].y)
    radius=3.2 if r['iso3'] not in MICROSTATES else 2.6
    parts.append(f'<circle id="city-{r["region_id"]}" class="city-dot" cx="{x:.2f}" cy="{y:.2f}" r="{radius}" data-city="{escape(r["city"])}" data-region-id="{r["region_id"]}"><title>{escape(r["city"])} — {escape(r["country"])}</title></circle>')
parts.append('</g>')

# Widoczne etykiety regionow. Nazwy miast sa celowo w osobnej, domyslnie ukrytej grupie
# oraz w CSV — mozna je wlaczyc zmieniajac display:none na display:inline.
parts.append('<g id="labels">')
for r in regions:
    lx,ly=to_svg_xy(r['label_proj'].x,r['label_proj'].y)
    if r['iso3'] in MICROSTATES:
        label=f"{r['iso3']}"
    else:
        label = r['region_name'] if r['region_count']>1 else r['country']
    parts.append(f'<text class="region-label{(" micro-label" if r["iso3"] in MICROSTATES else "")}" x="{lx:.2f}" y="{ly:.2f}">{escape(label)}</text>')
parts.append('</g>')
parts.append('<g id="city-labels" style="display:none">')
for r in regions:
    cx,cy=to_svg_xy(r['city_proj'].x,r['city_proj'].y)
    parts.append(f'<text class="city-label" x="{cx:.2f}" y="{cy-6:.2f}" data-region-id="{r["region_id"]}">{escape(r["city"])}</text>')
parts.append('</g>')

# Legenda z regula podzialu.
legend_x, legend_y = 48, SVG_H-128
parts.append(f'''<g id="legend" class="legend">
<rect x="{legend_x-16}" y="{legend_y-28}" width="520" height="108" rx="8" fill="#ffffff" fill-opacity="0.88" stroke="#c7d0d8"/>
<text x="{legend_x}" y="{legend_y-8}" font-size="14" font-weight="bold">Podział syntetyczny wg powierzchni państwa</text>
<text x="{legend_x}" y="{legend_y+12}" font-size="11">&lt;100 tys. km²: 1 • 100–200: 2 • 200–350: 3 • 350–650: 4 • 650–1000: 5 • ≥1 mln: 6</text>
<text x="{legend_x}" y="{legend_y+31}" font-size="10">Wyjątek zgodny z założeniem: Wielka Brytania = 4. Litwa, Łotwa, Estonia = 1; Polska = 3; Niemcy i Francja = 4.</text>
<text x="{legend_x}" y="{legend_y+50}" font-size="10">Granice wewnętrzne to Voronoi wokół głównych miast — nie są podziałem administracyjnym.</text>
<text x="{legend_x}" y="{legend_y+68}" font-size="9">Mikropaństwa są powiększone jako znaczniki dla czytelności. Nazwy miast są w CSV i w ukrytej grupie SVG #city-labels.</text>
</g>''')
parts.append('</svg>')
SVG_PATH.write_text('\n'.join(parts),encoding='utf-8')

# README.
readme = f"""MAPA EUROPY — SVG + CSV

Pliki:
- {SVG_PATH.name}: mapa SVG {SVG_W}×{SVG_H}; każdy obszar ma osobny path z ID np. pol-r1.
- {CSV_PATH.name}: nazwa głównego miasta każdego obszaru + lon/lat + svg_x/svg_y.
- {REGIONS_CSV_PATH.name}: dodatkowa tabela regionów i ID elementów SVG.

Reguła liczby obszarów wg powierzchni państwa:
<100 000 km² = 1; 100–200 tys. = 2; 200–350 tys. = 3; 350–650 tys. = 4; 650 tys.–1 mln = 5; >=1 mln = 6.
Wyjątek: Wielka Brytania = 4 (zgodnie z wymaganiem). Litwa/Łotwa/Estonia = 1, Polska = 3, Niemcy/Francja = 4.

Sposób podziału:
Dla państw wieloobszarowych granice są syntetycznym diagramem Voronoi wokół wybranych dużych miast, przyciętym do granic kraju. To NIE są granice administracyjne.

Zakres:
Europa wraz z Turcją, Cyprem i państwami Kaukazu, bez Kazachstanu i bez odległych terytoriów zamorskich. Rosja jest pokazana tylko w zakresie mapy europejskiej. Mikropaństwa Andora, Liechtenstein, Monako, San Marino i Watykan są celowo powiększone jako znaczniki.

Dane geometrii:
CountryInfo (geometrie GeoJSON pochodzenia Natural Earth) + lokalny Natural Earth lowres dla Serbii/Czarnogóry/Kosowa. Granice sporne są kartograficznym uproszczeniem i nie należy ich traktować jako źródła prawnego.

Współrzędne SVG:
Początek (0,0) znajduje się w lewym górnym rogu. x rośnie w prawo, y w dół. Wartości svg_x/svg_y są gotowe do użycia w tym dokładnym viewBoxie 0 0 {SVG_W} {SVG_H}. W SVG istnieje też grupa #city-labels z display:none — można ją włączyć bez ponownego liczenia pozycji.
"""
README_PATH.write_text(readme,encoding='utf-8')

# Kontrole.
counts={}
for r in regions: counts[r['iso3']] = counts.get(r['iso3'],0)+1
assert counts['LTU']==1 and counts['LVA']==1 and counts['EST']==1
assert counts['POL']==3
assert counts['DEU']==4 and counts['FRA']==4 and counts['GBR']==4
assert len(city_rows)==len(regions)

# ZIP.
with zipfile.ZipFile(ZIP_PATH,'w',zipfile.ZIP_DEFLATED) as z:
    for p in [SVG_PATH,CSV_PATH,REGIONS_CSV_PATH,README_PATH]:
        z.write(p,arcname=p.name)

print('countries',len(country_records),'regions',len(regions))
print('counts examples',{k:counts[k] for k in ['LTU','LVA','EST','POL','DEU','FRA','GBR','RUS','TUR']})
print(SVG_PATH, SVG_PATH.stat().st_size)
print(CSV_PATH, CSV_PATH.stat().st_size)
print(ZIP_PATH, ZIP_PATH.stat().st_size)
