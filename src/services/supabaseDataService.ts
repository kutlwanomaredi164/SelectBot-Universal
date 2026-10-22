import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ChatbotConfig, KnowledgeBaseItem } from '../types';

export const supabaseDataService = {
  isConfigured: isSupabaseConfigured,

  // 1. Fetch all bots owned by the authenticated user
  async getUserBots(userId: string): Promise<ChatbotConfig[]> {
    if (!isSupabaseConfigured || !userId) return [];

    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching bots from Supabase:', error);
      throw error;
    }

    if (!data) return [];

    return data.map((row: any) => this.mapDbRowToBot(row));
  },

  // 2. Fetch a single bot by ID (for dashboard editor)
  async getBot(id: string): Promise<ChatbotConfig | null> {
    if (!isSupabaseConfigured || !id || id === 'undefined') return null;

    let { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!data && !error) {
      // Fallback lookup by public_slug
      const bySlug = await supabase
        .from('bots')
        .select('*')
        .eq('public_slug', id)
        .maybeSingle();
      data = bySlug.data;
    }

    if (error || !data) {
      return null;
    }

    return this.mapDbRowToBot(data);
  },

  // 3. Fetch a single bot by public slug or deployment ID (for public visitors)
  // CRITICAL: Public chatbot pages must not require auth.uid(), current user, workspace membership, or bot ownership.
  async getPublicBotBySlug(slug: string): Promise<ChatbotConfig | null> {
    if (!isSupabaseConfigured || !slug) return null;

    const cleanSlug = decodeURIComponent(slug).trim();

    // Primary lookup: public_slug and status='published'
    let { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('public_slug', cleanSlug)
      .eq('status', 'published')
      .maybeSingle();

    // Fallback: If cleanSlug is a UUID, check id with status='published'
    if (!data && cleanSlug.includes('-') && cleanSlug.length === 36) {
      const byId = await supabase
        .from('bots')
        .select('*')
        .eq('id', cleanSlug)
        .eq('status', 'published')
        .maybeSingle();
      data = byId.data;
    }

    if (error || !data) {
      return null;
    }

    return this.mapDbRowToBot(data);
  },

  // 4. Save or update a chatbot in Supabase
  async saveBot(bot: ChatbotConfig, userId: string): Promise<ChatbotConfig> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const safeId = bot.id || `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const publicSlug = (
      bot.publicSlug ||
      bot.deployment?.deploymentId ||
      `bot-${safeId.replace(/[^a-zA-Z0-9]/g, '')}`
    ).toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const isValidUuid = Boolean(bot.id && bot.id.includes('-') && bot.id.length === 36);

    const payload: Record<string, any> = {
      owner_id: userId,
      name: bot.name,
      description: bot.description || '',
      business_name: bot.businessName,
      welcome_message:
        bot.appearance?.greetingMessage ||
        bot.aiConfig?.greetingMessage ||
        'Hey! How can we help you today?',
      system_instructions: bot.aiConfig?.systemPrompt || '',
      appearance_settings: {
        ...bot.appearance,
        suggestedQuestions: bot.suggestedQuestions || [],
      },
      model_settings: {
        model: bot.aiConfig?.model || 'gemini-3.8-flash',
        temperature: bot.aiConfig?.temperature ?? 0.3,
        fallbackMessage: bot.aiConfig?.fallbackMessage,
      },
      main_menu_items: bot.mainMenuItems || [],
      status: bot.status || 'draft',
      public_slug: publicSlug,
      updated_at: new Date().toISOString(),
      published_at:
        bot.status === 'published'
          ? bot.lastPublishedAt || new Date().toISOString()
          : null,
    };

    if (isValidUuid) {
      payload.id = bot.id;
    }

    // If ID is valid UUID, upsert. Otherwise insert or match by public_slug
    let dbBot: any;
    if (isValidUuid && bot.ownerId === userId) {
      const { data, error } = await supabase
        .from('bots')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      dbBot = data;
    } else {
      // Check existing by public_slug
      const { data: existing } = await supabase
        .from('bots')
        .select('id')
        .eq('owner_id', userId)
        .eq('public_slug', publicSlug)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('bots')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        dbBot = data;
      } else {
        const { data, error } = await supabase
          .from('bots')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        dbBot = data;
      }
    }

    // Sync deployment record
    await supabase.from('deployments').upsert({
      owner_id: userId,
      bot_id: dbBot.id,
      public_slug: publicSlug,
      deployment_status: bot.deployment?.isEnabled ? 'active' : 'inactive',
      allowed_domains: bot.deployment?.allowedDomains || ['*'],
      updated_at: new Date().toISOString(),
    });

    return this.mapDbRowToBot(dbBot);
  },

  // 5. Delete bot
  async deleteBot(botId: string, userId: string): Promise<boolean> {
    if (!isSupabaseConfigured || !botId || botId === 'undefined') return false;
    const { error } = await supabase
      .from('bots')
      .delete()
      .eq('id', botId)
      .eq('owner_id', userId);
    return !error;
  },

  // 6. Knowledge Sources (Business FAQs, documents, policies)
  async getKnowledgeSources(botId: string): Promise<KnowledgeBaseItem[]> {
    if (!isSupabaseConfigured || !botId || botId === 'undefined') return [];

    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('bot_id', botId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      botId: row.bot_id,
      title: row.title,
      type: (row.source_type || 'text') as any,
      content: row.content || '',
      category: row.metadata?.category || 'general',
      tags: row.metadata?.tags || [],
      ingestionStatus: row.processing_status || 'ready',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addKnowledgeSource(
    botId: string,
    item: Partial<KnowledgeBaseItem>,
    userId: string
  ): Promise<KnowledgeBaseItem> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    if (!botId || botId === 'undefined') throw new Error('Valid bot ID required to add knowledge.');

    const { data, error } = await supabase
      .from('knowledge_sources')
      .insert({
        owner_id: userId,
        bot_id: botId,
        source_type: item.type || 'text',
        title: item.title || 'Untitled Knowledge',
        content: item.content || '',
        processing_status: 'ready',
        metadata: {
          category: item.category || 'general',
          tags: item.tags || [],
        },
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      botId: data.bot_id,
      title: data.title,
      type: (data.source_type || 'text') as any,
      content: data.content || '',
      category: data.metadata?.category || 'general',
      tags: data.metadata?.tags || [],
      ingestionStatus: data.processing_status || 'ready',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  async deleteKnowledgeSource(itemId: string, userId: string): Promise<boolean> {
    if (!isSupabaseConfigured || !itemId || itemId === 'undefined') return false;

    const { error } = await supabase
      .from('knowledge_sources')
      .delete()
      .eq('id', itemId)
      .eq('owner_id', userId);

    return !error;
  },

  // 7. Upload document to Supabase Storage ('knowledge-files')
  async uploadKnowledgeFile(userId: string, file: File): Promise<{ path: string; publicUrl?: string }> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. File upload requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File exceeds the 10MB size limit.');
    }

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${userId}/${Date.now()}_${cleanName}`;

    const { data, error } = await supabase.storage
      .from('knowledge-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase Storage upload error: ${error.message}`);
    }

    return { path: data.path };
  },

  // 8. Record visitor conversation to Supabase (Anonymous Public Chatbot)
  async recordConversation(
    botIdOrSlug: string,
    sessionId: string,
    customerName?: string,
    customerContact?: string
  ): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      let botUuid = botIdOrSlug;
      if (!botUuid.includes('-') || botUuid.length !== 36) {
        const { data } = await supabase
          .from('bots')
          .select('id')
          .eq('public_slug', botIdOrSlug)
          .eq('status', 'published')
          .maybeSingle();
        if (data?.id) botUuid = data.id;
      }

      if (botUuid.includes('-') && botUuid.length === 36) {
        const { data, error } = await supabase
          .from('conversations')
          .insert({
            bot_id: botUuid,
            session_identifier: sessionId,
            customer_name: customerName || null,
            customer_contact: customerContact || null,
            status: 'active',
          })
          .select('id')
          .single();

        if (!error && data) return data.id;
      }
    } catch (e) {
      console.warn('Supabase recordConversation notice:', e);
    }
    return null;
  },

  // 9. Record individual message to Supabase
  async recordMessage(
    conversationId: string,
    role: 'customer' | 'bot' | 'agent' | 'system',
    content: string,
    payload?: any
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      if (conversationId.includes('-') && conversationId.length === 36) {
        const { error } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          role,
          content,
          payload: payload || {},
        });
        return !error;
      }
    } catch (e) {
      console.warn('Supabase recordMessage notice:', e);
    }
    return false;
  },

  // 10. Map Supabase table row to ChatbotConfig
  mapDbRowToBot(row: any): ChatbotConfig {
    const appearance = row.appearance_settings || {};
    const modelSettings = row.model_settings || {};
    const publicSlug = row.public_slug || `bot-${row.id}`;

    return {
      id: row.id,
      ownerId: row.owner_id,
      publicSlug,
      workspaceId: 'ws_supabase',
      name: row.name,
      businessName: row.business_name,
      industry: appearance.industry || 'General Business',
      description: row.description || '',
      businessCategory: appearance.businessCategory,
      primaryPurpose: appearance.primaryPurpose,
      toneAndPersonality: appearance.toneAndPersonality,
      suggestedQuestions: appearance.suggestedQuestions || [
        'What are your services?',
        'How much does it cost?',
        'How can I get in touch?',
      ],
      conversationStyle: appearance.conversationStyle || 'hybrid',
      status: row.status || 'draft',
      lastPublishedAt: row.published_at,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
      currency: appearance.currency || 'ZAR',
      mainMenuItems: row.main_menu_items || [],
      appearance: {
        botDisplayName: appearance.botDisplayName || `${row.business_name} Assistant`,
        greetingMessage:
          row.welcome_message ||
          appearance.greetingMessage ||
          `Hey! Welcome to ${row.business_name}. How can we help you today?`,
        logoUrl: appearance.logoUrl || '',
        brandColor: appearance.brandColor || '#4f46e5',
        accentColor: appearance.accentColor || '#6366f1',
        launcherPosition: appearance.launcherPosition || 'bottom_right',
        headerStyle: appearance.headerStyle || 'solid',
        widgetSize: appearance.widgetSize || 'standard',
        welcomeScreenText: appearance.welcomeScreenText || 'Select an option or type your question.',
      },
      deployment: {
        deploymentId: publicSlug,
        isEnabled: row.status === 'published',
        allowedDomains: ['*'],
        embedSnippet: `<script src="/widget.js" data-bot-id="${publicSlug}" async></script>`,
        whatsappConfig: {
          isConnected: false,
          status: 'disconnected',
        },
      },
      aiConfig: {
        model: modelSettings.model || 'gemini-3.8-flash',
        systemPrompt: row.system_instructions || '',
        temperature: modelSettings.temperature ?? 0.3,
        greetingMessage:
          row.welcome_message ||
          `Hey! Welcome to ${row.business_name}. How can we help you today?`,
        fallbackMessage:
          modelSettings.fallbackMessage ||
          `I'd love to help you with that! Please choose an option or contact our team.`,
      },
    };
  },
};
