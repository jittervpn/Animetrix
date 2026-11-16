// /compartir?t=&id= — en la app, Android lo intercepta y abre el menú "Compartir".
// Si llega al servidor (por ejemplo desde la web), redirige al enlace universal del título.
import { asType, asInt } from '../lib/inkaflix.js';

export default function handler(req, res) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const type = asType(one(req.query?.t));
  const id = asInt(one(req.query?.id), 1, 99999999);
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', type && id != null ? `/abrir?t=${type}&id=${id}` : '/');
  res.end();
}
