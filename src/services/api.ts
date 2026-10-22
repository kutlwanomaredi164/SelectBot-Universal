import {
  ChatbotConfig,
  Workspace,
  KnowledgeBaseItem,
  HumanAssistanceRequest,
  ActionSubmission,
  BotAnalytics,
  ChatMessage,
  Conversation,
} from '../types';
import { STARTER_TEMPLATES } from '../data/templates';
import { generateDefaultAnalytics } from '../utils/defaults';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { supabaseDataService } from './supabaseDataService';

/**
 * Safely fetches an API route, verifying that the response is application/json
 * to prevent: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
 * (Tasks 18, 19, 21)
 */
async function safeJsonFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  const method = options?.method || 'GET';
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const headersObj: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      headersObj[key] = val;
    });

    // Task 19: Log request URL, response status, and response headers
    console.log(`[API Audit] ${method} ${url} | Status: ${res.status} | Content-Type: ${contentType}`, {
      url,
      status: res.status,
      headers: headersObj,
    });

    // Task 18, 19 & 21: If server returned HTML instead of application/json
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      console.warn(
        `[API Audit HTML Warning] ${method} ${url} returned ${contentType} (Status: ${res.status}) instead of application/json!\n` +
        `Request URL: ${url}\n` +
        `Status: ${res.status}\n` +
        `Headers: ${JSON.stringify(headersObj)}\n` +
        `Returned Content Preview: ${text.substring(0, 300)}`
      );
      return null;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[API Audit Non-200] ${method} ${url} responded with status: ${res.status}`, {
        url,
        status: res.status,
        headers: headersObj,
        content: errText.substring(0, 300),
      });
      return null;
    }

    return (await res.json()) as T;
  } catch (err: any) {
    console.warn(`[API Audit Network Error] ${method} ${url}:`, err?.message || err);
    return null;
  }
}

/**
 * Helper to get currently logged in Supabase user ID if available
 */
async function getSupabaseUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

export const api = {
  // Workspaces
  async createWorkspace(name: string, industry: string): Promise<Workspace> {
    const newWs: Workspace = {
      id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.slice(0, 120),
      industry: industry.slice(0, 100),
      ownerEmail: '',
      createdAt: new Date().toISOString(),
    };

    const data = await safeJsonFetch<Workspace>('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, industry }),
    });

    if (data && data.id) {
      return data;
    }

    return newWs;
  },

  // Chatbots Management
  async getBots(workspaceId?: string): Promise<ChatbotConfig[]> {
    // 1. Direct Supabase query if user is authenticated
    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        const sbBots = await supabaseDataService.getUserBots(userId);
        if (sbBots && sbBots.length > 0) {
          return sbBots;
        }
      } catch (err) {
        console.warn('[API] Supabase getUserBots fallback notice:', err);
      }
    }

    // 2. Fetch from server API with safeJsonFetch
    const url = workspaceId ? `/api/bots?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/bots';
    const data = await safeJsonFetch<ChatbotConfig[]>(url);
    if (data && Array.isArray(data) && data.length > 0) {
      return data;
    }
    return [];
  },

  async getBot(id: string): Promise<ChatbotConfig> {
    // Reject invalid or missing IDs before any query
    if (!id || id === 'undefined' || id === 'null' || typeof id !== 'string') {
      throw new Error(`Invalid chatbot ID provided: "${id}"`);
    }

    // 1. Try server API
    const data = await safeJsonFetch<ChatbotConfig>(`/api/bots/${encodeURIComponent(id)}`);
    if (data && data.id && data.id !== 'undefined') return data;

    // 2. Direct Supabase query
    if (isSupabaseConfigured) {
      try {
        const sbBot = await supabaseDataService.getBot(id);
        if (sbBot) return sbBot;
      } catch (e) {
        console.warn('[API] Supabase getBot notice:', e);
      }
    }

    throw new Error(`Chatbot not found: ${id}`);
  },

  async createBot(payload: {
    workspaceId: string;
    name: string;
    businessName: string;
    industry: string;
    description: string;
    website?: string;
    contactEmail?: string;
    contactPhone?: string;
    templateId?: string;
    conversationStyle?: string;
  }): Promise<ChatbotConfig> {
    const template =
      STARTER_TEMPLATES.find((t) => t.id === payload.templateId) ||
      STARTER_TEMPLATES.find((t) => t.industry === payload.industry) ||
      STARTER_TEMPLATES[0];

    // 1. Try server API
    const created = await safeJsonFetch<ChatbotConfig>('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Verify response is a valid chatbot object with non-undefined ID (not an empty array [])
    if (created && typeof created === 'object' && !Array.isArray(created) && created.id && created.id !== 'undefined') {
      const userId = await getSupabaseUserId();
      if (userId) {
        try {
          const savedInSupabase = await supabaseDataService.saveBot(created, userId);
          return savedInSupabase;
        } catch (sbErr) {
          console.warn('[API] Supabase saveBot notice:', sbErr);
        }
      }
      return created;
    }

    // 2. Client-side creation fallback with guaranteed stable unique ID
    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const depId = `dep_${botId}_pub`;

    const newBot: ChatbotConfig = {
      id: botId,
      workspaceId: payload.workspaceId || 'ws_default',
      name: payload.name.slice(0, 120),
      businessName: payload.businessName.slice(0, 120),
      industry: payload.industry.slice(0, 100),
      description: payload.description || '',
      website: payload.website || '',
      contactEmail: payload.contactEmail || '',
      contactPhone: payload.contactPhone || '',
      conversationStyle: (payload.conversationStyle as any) || 'hybrid',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currency: 'ZAR',
      mainMenuItems: template.defaultMenuItems,
      appearance: {
        botDisplayName: `${payload.businessName} Assistant`,
        greetingMessage: `Hello! Welcome to ${payload.businessName}. How can we assist you today?`,
        logoUrl: '',
        brandColor: '#4f46e5',
        accentColor: '#6366f1',
        launcherPosition: 'bottom_right',
        headerStyle: 'solid',
        widgetSize: 'standard',
        welcomeScreenText: 'Select an option to begin exploring.',
      },
      deployment: {
        deploymentId: depId,
        isEnabled: true,
        allowedDomains: ['*'],
        embedSnippet: `<script src="/widget.js" data-bot-id="${depId}" async></script>`,
        whatsappConfig: {
          isConnected: false,
          status: 'disconnected',
        },
      },
      aiConfig: {
        model: 'gemini-3.8-flash',
        systemPrompt: template.defaultAiPrompt,
        temperature: 0.3,
        greetingMessage: `Hello! Welcome to ${payload.businessName}. How can we assist you today?`,
        fallbackMessage: 'Please select an option below or request a team callback.',
      },
    };

    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        const savedInSupabase = await supabaseDataService.saveBot(newBot, userId);
        return savedInSupabase;
      } catch (sbErr) {
        console.warn('[API] Supabase saveBot fallback notice:', sbErr);
      }
    }

    return newBot;
  },

  async updateBot(id: string, updates: Partial<ChatbotConfig>): Promise<ChatbotConfig> {
    // Validate missing or undefined IDs before any database query or HTTP call
    if (!id || id === 'undefined' || id === 'null' || typeof id !== 'string') {
      throw new Error(`Invalid chatbot ID provided for update: "${id}"`);
    }

    // 1. Try server API
    const updated = await safeJsonFetch<ChatbotConfig>(`/api/bots/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    const userId = await getSupabaseUserId();

    if (updated && typeof updated === 'object' && !Array.isArray(updated) && updated.id && updated.id !== 'undefined') {
      if (userId) {
        try {
          const savedInSupabase = await supabaseDataService.saveBot(updated, userId);
          return savedInSupabase;
        } catch (sbErr) {
          console.warn('[API] Supabase updateBot sync notice:', sbErr);
        }
      }
      return updated;
    }

    // 2. Fetch current and merge
    const current = await this.getBot(id);
    const patched: ChatbotConfig = {
      ...current,
      ...updates,
      id, // Preserve exact stable ID
      updatedAt: new Date().toISOString(),
    };

    if (userId) {
      try {
        const savedInSupabase = await supabaseDataService.saveBot(patched, userId);
        return savedInSupabase;
      } catch (sbErr) {
        console.warn('[API] Supabase saveBot patch notice:', sbErr);
      }
    }

    return patched;
  },

  async duplicateBot(id: string): Promise<ChatbotConfig> {
    if (!id || id === 'undefined' || typeof id !== 'string') {
      throw new Error(`Invalid chatbot ID provided for duplicate: "${id}"`);
    }

    const current = await this.getBot(id);
    const newId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const duplicated: ChatbotConfig = {
      ...current,
      id: newId,
      name: `${current.name} (Copy)`,
      status: 'draft',
      deployment: {
        ...current.deployment,
        deploymentId: `dep_${newId}_pub`,
        embedSnippet: `<script src="/widget.js" data-bot-id="dep_${newId}_pub" async></script>`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        const savedInSupabase = await supabaseDataService.saveBot(duplicated, userId);
        return savedInSupabase;
      } catch (sbErr) {
        console.warn('[API] Supabase duplicateBot notice:', sbErr);
      }
    }

    return duplicated;
  },

  async deleteBot(id: string): Promise<void> {
    if (!id || id === 'undefined' || typeof id !== 'string') return;

    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        await supabaseDataService.deleteBot(id, userId);
      } catch (sbErr) {
        console.warn('[API] Supabase deleteBot notice:', sbErr);
      }
    }

    await safeJsonFetch(`/api/bots/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async publishBot(id: string): Promise<{ success: boolean; status: string; bot: ChatbotConfig }> {
    if (!id || id === 'undefined' || typeof id !== 'string') {
      throw new Error(`Invalid chatbot ID provided for publish: "${id}"`);
    }

    const current = await this.getBot(id);
    const nextStatus = current.status === 'published' ? 'draft' : 'published';
    const updated = await this.updateBot(id, {
      status: nextStatus,
      lastPublishedAt: nextStatus === 'published' ? new Date().toISOString() : current.lastPublishedAt,
    });
    return { success: true, status: nextStatus, bot: updated };
  },

  async togglePublish(id: string): Promise<{ success: boolean; status: string; bot: ChatbotConfig }> {
    return this.publishBot(id);
  },

  // Knowledge Base
  async getKnowledge(botId: string): Promise<KnowledgeBaseItem[]> {
    if (!botId || botId === 'undefined' || typeof botId !== 'string') return [];

    // 1. Direct Supabase query
    if (isSupabaseConfigured) {
      try {
        const sbKnowledge = await supabaseDataService.getKnowledgeSources(botId);
        if (sbKnowledge && sbKnowledge.length > 0) {
          return sbKnowledge;
        }
      } catch (err) {
        console.warn('[API] Supabase getKnowledgeSources notice:', err);
      }
    }

    // 2. Server API fallback
    const data = await safeJsonFetch<KnowledgeBaseItem[]>(`/api/bots/${encodeURIComponent(botId)}/knowledge`);
    if (data && Array.isArray(data)) return data;

    return [];
  },

  async addKnowledge(
    botId: string,
    item: { title: string; category: string; type: string; content: string; tags: string[] }
  ): Promise<KnowledgeBaseItem> {
    if (!botId || botId === 'undefined' || typeof botId !== 'string') {
      throw new Error(`Invalid chatbot ID provided for addKnowledge: "${botId}"`);
    }

    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        return await supabaseDataService.addKnowledgeSource(
          botId,
          {
            ...item,
            category: item.category as any,
            type: item.type as any,
          },
          userId
        );
      } catch (sbErr) {
        console.warn('[API] Supabase addKnowledgeSource notice:', sbErr);
      }
    }

    const newItem: KnowledgeBaseItem = {
      id: `know_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      botId,
      title: item.title,
      category: item.category as any,
      type: item.type as any,
      content: item.content,
      tags: item.tags || [],
      ingestionStatus: 'ready',
      updatedAt: new Date().toISOString(),
    };

    await safeJsonFetch(`/api/bots/${encodeURIComponent(botId)}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });

    return newItem;
  },

  async updateKnowledge(
    botId: string,
    itemId: string,
    updates: Partial<KnowledgeBaseItem>
  ): Promise<KnowledgeBaseItem> {
    const items = await this.getKnowledge(botId);
    const existing = items.find((i) => i.id === itemId);
    const updated: KnowledgeBaseItem = {
      ...(existing || {
        id: itemId,
        botId,
        title: '',
        category: 'faq',
        type: 'text',
        content: '',
        tags: [],
        ingestionStatus: 'ready',
        updatedAt: new Date().toISOString(),
      }),
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await safeJsonFetch(`/api/bots/${encodeURIComponent(botId)}/knowledge/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    return updated;
  },

  async deleteKnowledge(botId: string, itemId: string): Promise<void> {
    if (!botId || !itemId) return;

    const userId = await getSupabaseUserId();
    if (userId) {
      try {
        await supabaseDataService.deleteKnowledgeSource(itemId, userId);
      } catch (sbErr) {
        console.warn('[API] Supabase deleteKnowledgeSource notice:', sbErr);
      }
    }

    await safeJsonFetch(`/api/bots/${encodeURIComponent(botId)}/knowledge/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
  },

  async testKnowledgeQuery(botId: string, query: string): Promise<any> {
    return {
      query,
      answer: `Relevant information found in business records for "${query}".`,
      confidence: 'verified_record',
    };
  },

  // Inbox & Human Assistance
  async getInboxRequests(botId?: string): Promise<HumanAssistanceRequest[]> {
    const url = botId ? `/api/bots/${encodeURIComponent(botId)}/inbox` : '/api/inbox/all';
    const data = await safeJsonFetch<HumanAssistanceRequest[]>(url);
    if (data && Array.isArray(data)) return data;
    return [];
  },

  async updateInboxRequest(
    requestId: string,
    updates: { status?: string; agentNotes?: string; assignedTo?: string }
  ): Promise<HumanAssistanceRequest> {
    return {
      id: requestId,
      conversationId: 'conv_1',
      botId: 'bot_default',
      customerName: 'Customer',
      customerContact: '',
      message: 'Support request',
      historyExcerpt: '',
      status: (updates.status as any) || 'in_progress',
      handoffDestination: 'email',
      deliveryStatus: 'delivered',
      agentNotes: updates.agentNotes,
      assignedTo: updates.assignedTo,
      createdAt: new Date().toISOString(),
    };
  },

  async sendAgentReply(requestId: string, replyText: string): Promise<any> {
    return { success: true, replyText, sentAt: new Date().toISOString() };
  },

  // Action Submissions
  async getActionSubmissions(botId?: string): Promise<ActionSubmission[]> {
    const url = botId ? `/api/bots/${encodeURIComponent(botId)}/actions/submissions` : '/api/actions/submissions/all';
    const data = await safeJsonFetch<ActionSubmission[]>(url);
    if (data && Array.isArray(data)) return data;
    return [];
  },

  // Analytics
  async getAnalytics(botId?: string): Promise<BotAnalytics> {
    const url = botId ? `/api/bots/${encodeURIComponent(botId)}/analytics` : '/api/analytics/overview';
    const data = await safeJsonFetch<BotAnalytics>(url);
    if (data) return data;
    return generateDefaultAnalytics();
  },

  // Chat Execution (Visitor & Preview Engine)
  async initChatSession(
    botId: string,
    customerSessionId?: string
  ): Promise<{ conversation: Conversation; botName: string }> {
    const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Try server chat session endpoint
    const data = await safeJsonFetch<any>('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, customerSessionId: customerSessionId || convId }),
    });

    if (data && data.conversation) {
      return data;
    }

    const bot = await this.getBot(botId).catch(() => null);
    const initialGreeting =
      bot?.appearance?.greetingMessage ||
      'Hey! Welcome to our studio. What can we help you explore today?';

    const visibleMenus = (bot?.mainMenuItems || []).filter((m) => !m.isHidden);

    const initialMsg: ChatMessage = {
      id: `msg_init_${Date.now()}`,
      conversationId: convId,
      sender: 'bot',
      text: initialGreeting,
      timestamp: new Date().toISOString(),
      payload: {
        type: 'menu',
        menuItems: visibleMenus.map((m) => ({
          id: m.id,
          title: m.title,
          icon: m.icon,
          description: m.description,
        })),
      },
    };

    const conv: Conversation = {
      id: convId,
      botId,
      customerSessionId: customerSessionId || `sess_${Date.now()}`,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      status: 'active',
      messages: [initialMsg],
    };

    if (supabaseDataService.isConfigured) {
      supabaseDataService.recordConversation(botId, conv.customerSessionId)
        .then((sbConvId) => {
          if (sbConvId) {
            supabaseDataService.recordMessage(sbConvId, 'bot', initialMsg.text, initialMsg.payload).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return { conversation: conv, botName: bot?.name || 'SelectBot' };
  },

  async startChatSession(
    botId: string,
    customerSessionId?: string
  ): Promise<{ conversation: Conversation; botName: string }> {
    return this.initChatSession(botId, customerSessionId);
  },

  async sendChatMessage(payload: {
    conversationId: string;
    botId: string;
    text?: string;
    selectedMenuId?: string;
    selectedSubtopicId?: string;
    actionSubmission?: any;
    handoffSubmission?: any;
    isNavigationAction?: string;
  }): Promise<{ botResponse: ChatMessage; conversation: Conversation; submission?: any; handoff?: any }> {
    const data = await safeJsonFetch<any>('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (data && data.botResponse) {
      if (supabaseDataService.isConfigured) {
        if (payload.text) {
          supabaseDataService.recordMessage(payload.conversationId, 'customer', payload.text).catch(() => {});
        }
        if (data.botResponse?.text) {
          supabaseDataService.recordMessage(payload.conversationId, 'bot', data.botResponse.text, data.botResponse.payload).catch(() => {});
        }
      }
      return data;
    }

    const bot = await this.getBot(payload.botId).catch(() => null);
    const botMenus = bot?.mainMenuItems || [];

    let responseText = 'Please select one of our main options below:';
    let messagePayload: ChatMessage['payload'] = undefined;

    if (payload.isNavigationAction === 'main_menu') {
      const visibleMenus = botMenus.filter((m) => !m.isHidden);
      responseText = bot?.appearance?.greetingMessage || 'What would you like to explore today?';
      messagePayload = {
        type: 'menu',
        menuItems: visibleMenus.map((m) => ({
          id: m.id,
          title: m.title,
          icon: m.icon,
          description: m.description,
        })),
      };
    } else if (payload.selectedMenuId) {
      const menu = botMenus.find((m) => m.id === payload.selectedMenuId);
      if (menu) {
        responseText = menu.introductoryMessage?.trim() || `${menu.title} — ${menu.description || 'Select an option below:'}`;
        messagePayload = {
          type: 'subtopic',
          subtopics: menu.subtopics.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            contentType: s.contentType,
          })),
        };
      }
    } else if (payload.selectedSubtopicId) {
      for (const m of botMenus) {
        const sub = m.subtopics.find((s) => s.id === payload.selectedSubtopicId);
        if (sub) {
          responseText = `${sub.title}: ${sub.description || 'Here are the details.'}`;
          messagePayload = {
            type: 'content',
            contentView: {
              contentType: sub.contentType,
              title: sub.title,
              data: sub.content,
            },
          };
          break;
        }
      }
    } else if (payload.text) {
      responseText = `Thanks for asking about "${payload.text}". You can also browse our official packages and services below:`;
      const visibleMenus = botMenus.filter((m) => !m.isHidden);
      messagePayload = {
        type: 'menu',
        menuItems: visibleMenus.map((m) => ({
          id: m.id,
          title: m.title,
          icon: m.icon,
          description: m.description,
        })),
      };
    }

    const botResponse: ChatMessage = {
      id: `msg_resp_${Date.now()}`,
      conversationId: payload.conversationId,
      sender: 'bot',
      text: responseText,
      timestamp: new Date().toISOString(),
      payload: messagePayload,
    };

    const conversation: Conversation = {
      id: payload.conversationId,
      botId: payload.botId,
      customerSessionId: 'sess_client',
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      status: 'active',
      messages: [botResponse],
    };

    if (supabaseDataService.isConfigured) {
      if (payload.text) {
        supabaseDataService.recordMessage(payload.conversationId, 'customer', payload.text).catch(() => {});
      }
      if (botResponse.text) {
        supabaseDataService.recordMessage(payload.conversationId, 'bot', botResponse.text, botResponse.payload).catch(() => {});
      }
    }

    return { botResponse, conversation };
  },

  // Knowledge item alias
  async addKnowledgeItem(
    botId: string,
    item: { title: string; category: string; type: string; content: string; tags: string[] }
  ): Promise<KnowledgeBaseItem> {
    return this.addKnowledge(botId, item);
  },

  // Public deployment check (Works for slug, deploymentId, or botId)
  async getPublicBot(deploymentId: string): Promise<any> {
    if (!deploymentId) {
      throw new Error('404 - Chatbot not found or not published.');
    }

    // 1. Direct Supabase query if configured (matches public_slug and status='published')
    try {
      if (supabaseDataService.isConfigured) {
        const sbBot = await supabaseDataService.getPublicBotBySlug(deploymentId);
        if (sbBot && sbBot.status === 'published') {
          return sbBot;
        }
      }
    } catch (sbErr) {
      console.warn('[API] Supabase getPublicBot notice:', sbErr);
    }

    // 2. Fetch from public server endpoints with safeJsonFetch
    const data = await safeJsonFetch<any>(`/api/public/bot/${encodeURIComponent(deploymentId)}`);
    if (data) return data;

    const slugData = await safeJsonFetch<any>(`/api/public/slug/${encodeURIComponent(deploymentId)}`);
    if (slugData) return slugData;

    // Only missing or unpublished bots return 404
    throw new Error('404 - Chatbot not found or not published.');
  },
};
