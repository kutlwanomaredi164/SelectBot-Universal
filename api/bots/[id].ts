import type { IncomingMessage, ServerResponse } from 'http';

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Extract ID from URL path: /api/bots/:id or /api/bots/:id/publish
  const cleanUrl = (req.url || '').split('?')[0];
  const urlParts = cleanUrl.split('/').filter(Boolean);
  
  // urlParts: ['api', 'bots', ':id'] or ['api', 'bots', ':id', 'publish']
  const isPublish = urlParts.includes('publish');
  const botIdIndex = urlParts.indexOf('bots') + 1;
  const id = botIdIndex > 0 && botIdIndex < urlParts.length ? urlParts[botIdIndex] : '';

  // Task 2: Validate missing IDs before any query or processing
  if (!id || id === 'undefined' || id === 'null') {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        error: 'Invalid chatbot ID: ID cannot be undefined or empty',
        status: 400,
      })
    );
    return;
  }

  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const updated = {
      ...body,
      id,
      updatedAt: new Date().toISOString(),
    };
    res.statusCode = 200;
    res.end(JSON.stringify(updated));
    return;
  }

  if (req.method === 'POST') {
    if (isPublish) {
      const body = await parseBody(req);
      const nextStatus = body.status || 'published';
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          status: nextStatus,
          id,
          publishedAt: nextStatus === 'published' ? new Date().toISOString() : null,
        })
      );
      return;
    }
  }

  if (req.method === 'DELETE') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        success: true,
        message: 'Chatbot deleted successfully',
        id,
      })
    );
    return;
  }

  if (req.method === 'GET') {
    // Return standard 404 JSON for server runtime if not cached
    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: 'Chatbot not found on server runtime. Query client Supabase directly.',
        id,
        status: 404,
      })
    );
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed', status: 405 }));
}
