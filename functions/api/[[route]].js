// Cloudflare Pages Function. Storage: D1 binding "DB". Optional secret: GROUP_CODE (gates writes).
const COLLS = ['dates', 'votes', 'projects', 'ideas', 'ideaVotes', 'prompts'];
const MAX_DOC = 6000;      // characters per document
const MAX_ROWS = 5000;     // rows in the whole hub

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

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
