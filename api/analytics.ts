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

  const defaultAnalytics = {
    totalConversations: 0,
    totalMessages: 0,
    totalHandoffRequests: 0,
    unresolvedHandoffRequests: 0,
    totalActionSubmissions: 0,
    topMenuClicks: [],
    conversationsByDay: [
      { date: 'Mon', count: 0 },
      { date: 'Tue', count: 0 },
      { date: 'Wed', count: 0 },
      { date: 'Thu', count: 0 },
      { date: 'Fri', count: 0 },
      { date: 'Sat', count: 0 },
      { date: 'Sun', count: 0 },
    ],
    recentActivity: [],
  };

  res.statusCode = 200;
  res.end(JSON.stringify(defaultAnalytics));
}
