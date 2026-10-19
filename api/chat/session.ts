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

  const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const initialGreeting = 'Hello! Welcome to our studio. How can we assist you today?';

  const initialMsg = {
    id: `msg_init_${Date.now()}`,
    conversationId: convId,
    sender: 'bot',
    text: initialGreeting,
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
    id: convId,
    botId: 'bot_main',
    customerSessionId: `sess_${Date.now()}`,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    status: 'active',
    messages: [initialMsg],
  };

  res.statusCode = 200;
  res.end(JSON.stringify({ conversation, botName: 'SelectBot' }));
}
