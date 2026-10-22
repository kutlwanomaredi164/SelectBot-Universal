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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      workspaceId,
      name,
      businessName,
      industry,
      description,
      website,
      contactEmail,
      contactPhone,
      conversationStyle,
    } = body;

    if (!name || !businessName) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Chatbot name and business name are required' }));
      return;
    }

    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const deploymentId = `dep_${Math.random().toString(36).substring(2, 10)}`;

    const newBot = {
      id: botId,
      workspaceId: workspaceId || 'ws_default_1',
      name: String(name).slice(0, 120),
      businessName: String(businessName).slice(0, 120),
      industry: (industry || 'General Business').slice(0, 100),
      description: description || '',
      website: website || '',
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      conversationStyle: conversationStyle || 'hybrid',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currency: 'ZAR',
      mainMenuItems: [
        {
          id: 'menu_overview',
          title: 'Services & Offerings',
          description: 'Explore our core solutions',
          icon: 'Sparkles',
          actionType: 'text_response',
          responseText: 'Here is an overview of what we offer.',
          order: 1,
          isHidden: false,
        },
        {
          id: 'menu_quote',
          title: 'Request a Quote',
          description: 'Get an instant quotation or consultation',
          icon: 'Calculator',
          actionType: 'action_form',
          actionFormId: 'form_quote',
          order: 2,
          isHidden: false,
        },
        {
          id: 'menu_human',
          title: 'Talk to an Agent',
          description: 'Request a personal callback',
          icon: 'UserCheck',
          actionType: 'human_assistance',
          order: 3,
          isHidden: false,
        },
      ],
      appearance: {
        botDisplayName: `${businessName} Assistant`,
        greetingMessage: `Hey! Welcome to ${businessName}. How can we help you today?`,
        logoUrl: '',
        brandColor: '#4f46e5',
        accentColor: '#6366f1',
        launcherPosition: 'bottom_right',
        headerStyle: 'solid',
        widgetSize: 'standard',
        welcomeScreenText: 'Select an option below or type your question.',
      },
      deployment: {
        deploymentId,
        isEnabled: true,
        allowedDomains: ['*'],
        embedSnippet: `<script src="/widget.js" data-bot-id="${deploymentId}" async></script>`,
        whatsappConfig: {
          isConnected: false,
          status: 'disconnected',
        },
      },
      aiConfig: {
        model: 'gemini-3.8-flash',
        systemPrompt: `You are the AI assistant for ${businessName}. Provide friendly, accurate, and concise guidance.`,
        temperature: 0.3,
        greetingMessage: `Hey! Welcome to ${businessName}. How can we help you today?`,
        fallbackMessage: `I'd love to help you with that! Please choose an option from the menu below or tap 'Talk to an Agent'.`,
      },
    };

    res.statusCode = 201;
    res.end(JSON.stringify(newBot));
    return;
  }

  // GET: Return empty list or sample starter bots
  res.statusCode = 200;
  res.end(JSON.stringify([]));
}
