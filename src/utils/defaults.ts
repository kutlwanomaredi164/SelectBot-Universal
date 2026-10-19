import { ChatbotConfig, Workspace, UserAccount, BotAnalytics } from '../types';
import { STARTER_TEMPLATES } from '../data/templates';

/**
 * Creates a clean default bot for a newly registered user
 */
export function createDefaultBotForUser(userId: string, workspaceId: string, userName: string): ChatbotConfig {
  const photoTemplate = STARTER_TEMPLATES[0];
  const shortId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user1';
  const botId = `bot_${shortId}_101`;
  const depId = `dep_${shortId}_pub`;

  return {
    id: botId,
    workspaceId,
    name: 'Lens & Light Studio Bot',
    businessName: 'Lens & Light Photography',
    industry: 'Photography Studio',
    description: 'Boutique portrait and wedding photography studio with online booking and portfolio showcase.',
    website: 'https://lensandlight.co.za',
    contactEmail: 'contact@lensandlight.co.za',
    contactPhone: '+27 11 555 0192',
    conversationStyle: 'hybrid',
    status: 'published',
    lastPublishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currency: 'ZAR',
    mainMenuItems: photoTemplate.defaultMenuItems,
    appearance: {
      botDisplayName: 'Lens & Light Assistant',
      greetingMessage: 'Hey! Welcome to Lens & Light Photography. How can we help you today?',
      logoUrl: '',
      brandColor: '#4f46e5',
      accentColor: '#6366f1',
      launcherPosition: 'bottom_right',
      headerStyle: 'solid',
      widgetSize: 'standard',
      welcomeScreenText: 'Select a service below or type your question for instant answers.',
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
      systemPrompt: photoTemplate.defaultAiPrompt,
      temperature: 0.3,
      greetingMessage: 'Hey! Welcome to Lens & Light Photography. How can we help you today?',
      fallbackMessage: "I'd love to help you with that! For special requests, you can choose 'Talk to a Person' or pick from our services below.",
    },
  };
}

/**
 * Generates initial analytics metrics
 */
export function generateDefaultAnalytics(bots?: ChatbotConfig[]): BotAnalytics {
  return {
    totalConversations: 18,
    totalMessages: 64,
    totalHandoffRequests: 2,
    unresolvedHandoffRequests: 1,
    totalActionSubmissions: 5,
    topMenuClicks: [
      { menuId: 'menu_services', title: 'Services & Packages', count: 32 },
      { menuId: 'menu_portfolio', title: 'Portfolio & Work', count: 21 },
      { menuId: 'menu_policies', title: 'Studio Policies', count: 8 },
    ],
    conversationsByDay: [
      { date: 'Mon', count: 3 },
      { date: 'Tue', count: 5 },
      { date: 'Wed', count: 4 },
      { date: 'Thu', count: 8 },
      { date: 'Fri', count: 6 },
      { date: 'Sat', count: 12 },
      { date: 'Sun', count: 9 },
    ],
    recentActivity: [
      {
        id: 'act_sb_1',
        type: 'auth_success',
        description: 'Supabase Authentication and SaaS platform ready',
        timestamp: 'Just now',
      },
      {
        id: 'act_sb_2',
        type: 'bot_active',
        description: 'Chatbot engine ready for customer conversations',
        timestamp: '5m ago',
      },
    ],
  };
}

/**
 * Generates guest session for immediate preview without signing in
 */
export function getGuestSession(): {
  user: UserAccount;
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  bots: ChatbotConfig[];
  analytics: BotAnalytics;
} {
  const guestUser: UserAccount = {
    id: 'guest_user',
    name: 'Guest Business Owner',
    email: 'guest@example.com',
    role: 'owner',
    currentWorkspaceId: 'ws_guest_1',
  };
  const defaultWs: Workspace = {
    id: 'ws_guest_1',
    name: 'Lens & Light Studio',
    industry: 'Photography Studio',
    ownerEmail: 'guest@example.com',
    createdAt: new Date().toISOString(),
  };
  const defaultBot = createDefaultBotForUser('guest_user', defaultWs.id, guestUser.name);

  return {
    user: guestUser,
    workspaces: [defaultWs],
    currentWorkspace: defaultWs,
    bots: [defaultBot],
    analytics: generateDefaultAnalytics([defaultBot]),
  };
}
