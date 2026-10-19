import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Parse body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  let parsed: any = {};
  try {
    if (body) parsed = JSON.parse(body);
  } catch {
    // ignore
  }

  const conversationId = parsed.conversationId || `conv_${Date.now()}`;
  const userText = parsed.text || '';

  const botResponse = {
    id: `msg_resp_${Date.now()}`,
    conversationId,
    sender: 'bot',
    text: userText
      ? `Thank you for your message: "${userText}". Our team is available to help, or you can select options from the menu below.`
      : 'How can we help you today?',
    timestamp: new Date().toISOString(),
    payload: {
      type: 'menu',
      menuItems: [
        { id: 'm_explore', title: 'Explore Services', description: 'Browse our services and packages', icon: 'Sparkles' },
        { id: 'm_support', title: 'Customer Support', description: 'Talk to an advisor or request assistance', icon: 'HelpCircle' },
      ],
    },
  };

  const conversation = {
    id: conversationId,
    botId: parsed.botId || 'bot_main',
    customerSessionId: 'sess_client',
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    status: 'active',
    messages: [botResponse],
  };

  res.statusCode = 200;
  res.end(JSON.stringify({ botResponse, conversation }));
}
