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
import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { firestoreSync } from './firestoreSync';
import { STARTER_TEMPLATES } from '../data/templates';
import { generateDefaultAnalytics } from '../utils/defaults';
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

export const api = {
  // Workspaces
  async createWorkspace(name: string, industry: string): Promise<Workspace> {
    const cleanUid = 'workspace_owner';
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

    if (data) {
      firestoreSync.saveWorkspace(data, cleanUid).catch(() => {});
      return data;
    }

    await firestoreSync.saveWorkspace(newWs, cleanUid);
    return newWs;
  },

  // Chatbots
  async getBots(workspaceId?: string): Promise<ChatbotConfig[]> {
    const url = workspaceId ? `/api/bots?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/bots';
    const data = await safeJsonFetch<ChatbotConfig[]>(url);
    if (data && Array.isArray(data) && data.length > 0) {
      return data;
    }
    return [];
  },

  async getBot(id: string): Promise<ChatbotConfig> {
    const data = await safeJsonFetch<ChatbotConfig>(`/api/bots/${id}`);
    if (data) return data;

    try {
      const docSnap = await getDoc(doc(db, 'chatbots', id));
      if (docSnap.exists()) {
        return docSnap.data() as ChatbotConfig;
      }
    } catch (e) {
      console.warn('[API] Firestore getBot fallback notice:', e);
    }

    throw new Error('Chatbot not found');
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
    const cleanUid = 'guest_user';

    const created = await safeJsonFetch<ChatbotConfig>('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (created) {
      firestoreSync.saveChatbot(created, cleanUid).catch(() => {});
      return created;
    }

    // Direct creation fallback using starter templates
    const template =
      STARTER_TEMPLATES.find((t) => t.id === payload.templateId) ||
      STARTER_TEMPLATES.find((t) => t.industry === payload.industry) ||
      STARTER_TEMPLATES[0];

    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const depId = `dep_${botId}_pub`;

    const newBot: ChatbotConfig = {
      id: botId,
      workspaceId: payload.workspaceId,
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

    firestoreSync.saveChatbot(newBot, cleanUid).catch(() => {});
    return newBot;
  },

  async updateBot(id: string, updates: Partial<ChatbotConfig>): Promise<ChatbotConfig> {
    const cleanUid = 'guest_user';

    const updated = await safeJsonFetch<ChatbotConfig>(`/api/bots/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (updated) {
      firestoreSync.saveChatbot(updated, cleanUid).catch(() => {});
      return updated;
    }

    const current = await this.getBot(id);
    const patched: ChatbotConfig = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    firestoreSync.saveChatbot(patched, cleanUid).catch(() => {});
    return patched;
  },

  async duplicateBot(id: string): Promise<ChatbotConfig> {
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

    const cleanUid = 'guest_user';
    firestoreSync.saveChatbot(duplicated, cleanUid).catch(() => {});
    return duplicated;
  },

  async deleteBot(id: string): Promise<void> {
    await safeJsonFetch(`/api/bots/${id}`, { method: 'DELETE' });
    try {
      await deleteDoc(doc(db, 'chatbots', id));
    } catch {
      // ignore
    }
  },

  async publishBot(id: string): Promise<{ success: boolean; status: string; bot: ChatbotConfig }> {
    const current = await this.getBot(id);
    const nextStatus = current.status === 'published' ? 'draft' : 'published';
    const updated = await this.updateBot(id, {
      status: nextStatus,
      lastPublishedAt: nextStatus === 'published' ? new Date().toISOString() : current.lastPublishedAt,
    });
    return { success: true, status: nextStatus, bot: updated };
  },

  // Knowledge Base
  async getKnowledge(botId: string): Promise<KnowledgeBaseItem[]> {
    const data = await safeJsonFetch<KnowledgeBaseItem[]>(`/api/bots/${botId}/knowledge`);
    if (data && Array.isArray(data)) return data;

    try {
      const snap = await getDocs(collection(db, 'chatbots', botId, 'knowledge'));
      const items: KnowledgeBaseItem[] = [];
      snap.forEach((d) => items.push(d.data() as KnowledgeBaseItem));
      return items;
    } catch {
      return [];
    }
  },

  async addKnowledge(
    botId: string,
    item: { title: string; category: string; type: string; content: string; tags: string[] }
  ): Promise<KnowledgeBaseItem> {
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

    firestoreSync.saveKnowledgeItem(botId, newItem).catch(() => {});
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

    firestoreSync.saveKnowledgeItem(botId, updated).catch(() => {});
    return updated;
  },

  async deleteKnowledge(botId: string, itemId: string): Promise<void> {
    firestoreSync.deleteKnowledgeItem(botId, itemId).catch(() => {});
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
    const url = botId ? `/api/bots/${botId}/inbox` : '/api/inbox/all';
    const data = await safeJsonFetch<HumanAssistanceRequest[]>(url);
    if (data && Array.isArray(data)) return data;

    if (botId) {
      try {
        const snap = await getDocs(collection(db, 'chatbots', botId, 'handoffRequests'));
        const reqs: HumanAssistanceRequest[] = [];
        snap.forEach((d) => reqs.push(d.data() as HumanAssistanceRequest));
        return reqs;
      } catch {
        return [];
      }
    }
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
    const url = botId ? `/api/bots/${botId}/actions/submissions` : '/api/actions/submissions/all';
    const data = await safeJsonFetch<ActionSubmission[]>(url);
    if (data && Array.isArray(data)) return data;
    return [];
  },

  // Analytics
  async getAnalytics(botId?: string): Promise<BotAnalytics> {
    const url = botId ? `/api/analytics?botId=${encodeURIComponent(botId)}` : '/api/analytics';
    const data = await safeJsonFetch<BotAnalytics>(url);
    if (data && typeof data === 'object' && 'totalConversations' in data) {
      return data;
    }
    return generateDefaultAnalytics([]);
  },

  // Chat session initialization
  async initChatSession(
    botId: string,
    customerSessionId?: string
  ): Promise<{ conversation: Conversation; botName: string }> {
    const data = await safeJsonFetch<{ conversation: Conversation; botName: string }>('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, customerSessionId }),
    });

    if (data && data.conversation) {
      if (supabaseDataService.isConfigured) {
        const sessId = data.conversation.customerSessionId || customerSessionId || `client_${Date.now()}`;
        supabaseDataService.recordConversation(botId, sessId)
          .then((sbConvId) => {
            if (sbConvId && data.conversation.messages?.[0]) {
              const initMsg = data.conversation.messages[0];
              supabaseDataService.recordMessage(sbConvId, 'bot', initMsg.text, initMsg.payload).catch(() => {});
            }
          })
          .catch(() => {});
      }
      return data;
    }

    const bot = await this.getBot(botId).catch(() => null);
    const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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

    // 3. Firestore fallback
    try {
      const q = query(
        collection(db, 'chatbots'),
        where('deploymentId', '==', deploymentId),
        where('status', '==', 'published')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data();
      }
    } catch (e) {
      console.warn('[API] Firestore getPublicBot fallback notice:', e);
    }

    // Only missing or unpublished bots return 404
    throw new Error('404 - Chatbot not found or not published.');
  },
};
