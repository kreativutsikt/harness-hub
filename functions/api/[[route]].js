// Cloudflare Pages Function. Storage: D1 binding "DB". Optional secret: GROUP_CODE (gates writes).
const COLLS = ['dates', 'votes', 'projects', 'ideas', 'ideaVotes', 'prompts', 'links', 'comments'];
const MAX_DOC = 6000;
const MAX_ROWS = 5000;
const MAX_HTML = 500000;

const TYPE_INDUSTRY = {
  SoftwareApplication: 'Software',
  WebApplication: 'Software',
  MobileApplication: 'Software',
  VideoGame: 'Software',
  MedicalOrganization: 'Health',
  MedicalClinic: 'Health',
  Hospital: 'Health',
  Physician: 'Health',
  EducationalOrganization: 'Education',
  CollegeOrUniversity: 'Education',
  School: 'Education',
  Course: 'Education',
  FinancialService: 'Finance',
  BankOrCreditUnion: 'Finance',
  AccountingService: 'Finance',
  Store: 'Retail',
  Restaurant: 'Food',
  FoodEstablishment: 'Food',
  NewsMediaOrganization: 'Media',
  GovernmentOrganization: 'Government',
  NGO: 'Nonprofit',
  LegalService: 'Legal',
  HomeAndConstructionBusiness: 'Construction',
  AutomotiveBusiness: 'Automotive',
  LodgingBusiness: 'Hospitality',
  TouristAttraction: 'Travel',
  SportsOrganization: 'Sport',
  MusicGroup: 'Creative',
  Movie: 'Creative',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(s, n) {
  s = decode(s);
  return s.length > n ? s.slice(0, n).trim() : s;
}

function blockedHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.+$/, '').replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0') return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function publicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || blockedHost(u.hostname)) return null;
  return u;
}

function metaMap(html) {
  const found = {};
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  tags.forEach((tag) => {
    const key = (tag.match(/\b(?:property|name)\s*=\s*("|\')([\s\S]*?)\1/i) || [])[2];
    const content = (tag.match(/\bcontent\s*=\s*("|\')([\s\S]*?)\1/i) || [])[2];
    if (key && content) found[key.toLowerCase()] = decode(content);
  });
  return found;
}

function absUrl(value, base) {
  if (!value) return '';
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString().slice(0, 500);
  } catch (e) { return ''; }
}

function collectSchema(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collectSchema(n, acc)); return; }
  if (node['@graph']) collectSchema(node['@graph'], acc);
  [].concat(node['@type'] || []).forEach((t) => { if (typeof t === 'string') acc.types.push(t); });
  ['industry', 'applicationCategory', 'category'].forEach((key) => {
    const v = node[key];
    if (typeof v === 'string') acc.industries.push(v);
    else if (v && typeof v === 'object' && typeof v.name === 'string') acc.industries.push(v.name);
  });
  const image = node.image;
  if (!acc.image) {
    if (typeof image === 'string') acc.image = image;
    else if (Array.isArray(image) && typeof image[0] === 'string') acc.image = image[0];
    else if (image && typeof image.url === 'string') acc.image = image.url;
  }
}

export function parsePreview(html, pageUrl) {
  const meta = metaMap(html);
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const acc = { types: [], industries: [], image: '' };
  const blocks = html.match(/<script\b[^>]*type\s*=\s*("|\')application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi) || [];
  blocks.forEach((block) => {
    const raw = (block.match(/>([\s\S]*)$/) || [])[1] || '';
    const body = raw.replace(/<\/script>\s*$/i, '').trim();
    try { collectSchema(JSON.parse(body), acc); } catch (e) {}
  });
  let industry = acc.industries.map((s) => clip(s, 40)).find(Boolean) || '';
  if (!industry) {
    const typed = acc.types.find((t) => TYPE_INDUSTRY[t]);
    industry = typed ? TYPE_INDUSTRY[typed] : '';
  }
  const image = absUrl(meta['og:image'] || meta['twitter:image'] || acc.image, pageUrl);
  return {
    title: clip(meta['og:title'] || meta['twitter:title'] || titleTag, 180),
    description: clip(meta['og:description'] || meta['twitter:description'] || meta.description, 300),
    image,
    siteName: clip(meta['og:site_name'] || '', 80),
    industry,
    category: linkCategory(pageUrl, meta['og:type'] || '', acc.types),
  };
}

function linkCategory(pageUrl, ogType, types) {
  let host = '';
  try { host = new URL(pageUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return 'web'; }
  const og = String(ogType || '').toLowerCase();
  const hit = (list) => list.some((d) => host === d || host.endsWith('.' + d));
  if (og.includes('video') || hit(['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'tiktok.com'])) return 'video';
  if (hit(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'])) return 'code';
  if (hit(['twitter.com', 'x.com', 'reddit.com', 'bsky.app', 'mastodon.social'])) return 'social';
  if (hit(['amazon.com', 'amazon.co.uk', 'amazon.se', 'etsy.com', 'ebay.com']) || host.includes('shop')) return 'shopping';
  const kind = (types || []).join(' ');
  if (og.includes('article') || /Article|BlogPosting|NewsArticle|Report/.test(kind) || host.includes('medium.com') || host.includes('substack.com')) return 'article';
  return 'web';
}

async function readHtml(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (received < MAX_HTML) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    chunks.push(value);
  }
  try { reader.cancel(); } catch (e) {}
  const buf = new Uint8Array(Math.min(received, MAX_HTML));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, buf.length - offset);
    buf.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= buf.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

async function unfurl(body) {
  const target = publicUrl(body && body.url);
  if (!target) return json({ error: 'bad' }, 400);
  let res;
  try {
    res = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; HarnessHub/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return json({ error: 'fetch' }, 400);
  }
  const finalUrl = publicUrl(res.url || target.toString());
  if (!res.ok || !finalUrl) return json({ error: 'fetch' }, 400);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type && !type.includes('html') && !type.includes('xml')) return json({ error: 'fetch' }, 400);
  const html = await readHtml(res);
  const preview = parsePreview(html, finalUrl.toString());
  let domain = '';
  try { domain = finalUrl.hostname.replace(/^www\./, ''); } catch (e) {}
  return json({
    ok: true,
    url: finalUrl.toString(),
    domain,
    title: preview.title,
    description: preview.description,
    image: preview.image,
    siteName: preview.siteName,
    industry: preview.industry,
    category: preview.category,
  });
}

export async function onRequest({ request, env, params }) {
  const route = [].concat(params.route || [])[0];
  const code = env.GROUP_CODE || '';

  if (route === 'state' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT coll, id, data FROM docs').all();
    const out = { needCode: !!code };
    COLLS.forEach((c) => (out[c] = []));
    for (const r of results) {
      if (!out[r.coll]) continue;
      try { const d = JSON.parse(r.data); d.id = r.id; out[r.coll].push(d); } catch (e) {}
    }
    return json(out);
  }

  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (code && request.headers.get('x-group-code') !== code) return json({ error: 'code' }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad' }, 400); }

  if (route === 'unfurl') return unfurl(body);

  if (!COLLS.includes(body.coll) || !/^[A-Za-z0-9_-]{1,80}$/.test(body.id || '')) return json({ error: 'bad' }, 400);

  if (route === 'set') {
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return json({ error: 'bad' }, 400);
    const text = JSON.stringify(body.data);
    if (text.length > MAX_DOC) return json({ error: 'too big' }, 413);
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs').first();
    if (n >= MAX_ROWS) return json({ error: 'full' }, 413);
    await env.DB.prepare(
      'INSERT INTO docs (coll, id, data, ts) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(coll, id) DO UPDATE SET data = ?3, ts = ?4'
    ).bind(body.coll, body.id, text, Date.now()).run();
    return json({ ok: true });
  }

  if (route === 'delete') {
    await env.DB.prepare('DELETE FROM docs WHERE coll = ?1 AND id = ?2').bind(body.coll, body.id).run();
    return json({ ok: true });
  }

  return json({ error: 'route' }, 404);
}
