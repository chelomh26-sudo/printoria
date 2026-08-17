const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sjstuvixonakpjezkmpk.supabase.co';

function reply(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function headers() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function storeRows(keys) {
  const filter = keys.map(encodeURIComponent).join(',');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/printoria_store?key=in.(${filter})&select=key,data,updated_at`, { headers: headers() });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return Object.fromEntries((await response.json()).map(row => [row.key, row]));
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default async function handler(req, res) {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.POS_API_KEY) {
    return reply(res, 503, { error: 'Faltan SUPABASE_SECRET_KEY o POS_API_KEY en Vercel.' });
  }
  if (String(req.headers['x-pos-key'] || '') !== process.env.POS_API_KEY) {
    return reply(res, 401, { error: 'Clave de caja incorrecta.' });
  }

  try {
    if (req.method === 'GET') {
      const rows = await storeRows(['printoria_products', 'printoria_stock', 'printoria_sales']);
      return reply(res, 200, {
        products: rows.printoria_products?.data || [],
        stock: rows.printoria_stock?.data || [],
        sales: rows.printoria_sales?.data || [],
        updated_at: rows.printoria_stock?.updated_at || null,
      });
    }

    if (req.method === 'POST' && req.body?.action === 'sale.create') {
      const sale = { ...(req.body.sale || {}), fecha: req.body.sale?.fecha || localDate(), origen: 'Libre 17' };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pos_record_sale`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ p_sale: sale, p_lines: req.body.lines || [] }),
      });
      if (!response.ok) throw new Error(await response.text());
      return reply(res, 201, await response.json());
    }

    if (req.method === 'POST' && req.body?.action === 'sale.cancel') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pos_cancel_sale`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ p_sale_id: req.body.sale_id }),
      });
      if (!response.ok) throw new Error(await response.text());
      return reply(res, 200, await response.json());
    }

    return reply(res, 405, { error: 'Acción no soportada.' });
  } catch (error) {
    return reply(res, 400, { error: error.message || 'Error de sincronización' });
  }
}
