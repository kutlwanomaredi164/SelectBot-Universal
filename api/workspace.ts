import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const defaultWs = {
    id: 'ws_default',
    name: 'Main Workspace',
    industry: 'General Business',
    ownerEmail: '',
    createdAt: new Date().toISOString(),
  };

  res.statusCode = 200;
  res.end(JSON.stringify(defaultWs));
}
