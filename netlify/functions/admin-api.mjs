import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const store = () => getStore({ name: 'flerte-media', consistency: 'strong' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' };
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }, body: JSON.stringify(body) });
const secret = () => process.env.ADMIN_SECRET || '';
function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function tokenFor(user) {
  const payload = `${user}.${Date.now() + 12 * 60 * 60 * 1000}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}
function validToken(token) {
  if (!token || !secret()) return false;
  try {
    const raw = Buffer.from(token, 'base64url').toString();
    const [user, exp, sig] = raw.split('.');
    if (!user || !exp || !sig || Number(exp) < Date.now()) return false;
    const expected = crypto.createHmac('sha256', secret()).update(`${user}.${exp}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}
function auth(event) {
  return validToken((event.headers.authorization || '').replace(/^Bearer\s+/i, ''));
}
function safeName(name) {
  return String(name || 'foto').toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 90);
}

export default async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const method = event.httpMethod;
  const action = event.queryStringParameters?.action || '';

  if (method === 'POST' && action === 'login') {
    const { username, password } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD || !secret()) return json(503, { error: 'O acesso administrativo ainda não foi configurado no Netlify.' });
   const okUser = safeEqual(username, process.env.ADMIN_USER);
const okPass = safeEqual(password, process.env.ADMIN_PASSWORD);
    if (!okUser || !okPass) return json(401, { error: 'Utilizador ou palavra-passe incorretos.' });
    return json(200, { token: tokenFor(process.env.ADMIN_USER), expiresIn: 43200 });
  }

  if (method === 'GET' && action === 'list') {
    const s = store();
    const result = await s.list({ prefix: 'images/' });
    const images = (result.blobs || []).map(b => ({ id: b.key.replace(/^images\//, ''), name: b.key.replace(/^images\//, ''), url: `/.netlify/functions/admin-api?action=image&name=${encodeURIComponent(b.key.replace(/^images\//, ''))}` }));
    const setting = await s.get('settings/background');
    return json(200, { images, background: setting || '' });
  }

  if (method === 'GET' && action === 'image') {
    const name = safeName(event.queryStringParameters?.name);
    const blob = await store().get(`images/${name}`, { type: 'arrayBuffer' });
    if (!blob) return { statusCode: 404, headers: cors, body: 'Imagem não encontrada.' };
    const meta = await store().getMetadata(`images/${name}`);
    return { statusCode: 200, isBase64Encoded: true, headers: { ...cors, 'Content-Type': meta?.metadata?.contentType || 'image/jpeg', 'Cache-Control': 'public,max-age=31536000,immutable' }, body: Buffer.from(blob).toString('base64') };
  }

  if (!auth(event)) return json(401, { error: 'Não autorizado.' });

  if (method === 'POST' && action === 'upload') {
    const { name, type, data } = JSON.parse(event.body || '{}');
    if (!data || !String(type || '').startsWith('image/')) return json(400, { error: 'Envie uma imagem válida.' });
    const base64 = String(data).replace(/^data:[^;]+;base64,/, '');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 4 * 1024 * 1024) return json(413, { error: 'A imagem final deve ter no máximo 4 MB.' });
    const ext = (String(type).split('/')[1] || 'jpeg').replace('svg+xml', 'svg');
    const filename = safeName(name || `foto-${Date.now()}`) + (safeName(name || '').includes('.') ? '' : `.${ext}`);
    await store().set(`images/${filename}`, bytes, { metadata: { contentType: type } });
    return json(200, { ok: true, name: filename });
  }

  if (method === 'POST' && action === 'background') {
    const { name } = JSON.parse(event.body || '{}');
    const clean = safeName(name);
    const exists = await store().get(`images/${clean}`, { type: 'arrayBuffer' });
    if (!exists) return json(404, { error: 'Imagem não encontrada.' });
    await store().set('settings/background', clean);
    return json(200, { ok: true, background: clean });
  }

  if (method === 'DELETE' && action === 'delete') {
    const name = safeName(event.queryStringParameters?.name);
    if (!name) return json(400, { error: 'Nome inválido.' });
    await store().delete(`images/${name}`);
    return json(200, { ok: true });
  }

  return json(404, { error: 'Ação não encontrada.' });
};
