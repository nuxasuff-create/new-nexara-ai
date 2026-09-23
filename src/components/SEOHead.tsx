import { useEffect } from 'react';

interface SEOHeadProps {
  screenKey: string;
}

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
}

const PAGE_METADATA: Record<string, PageMeta> = {
  chat: {
    title: 'Nexara AI – Next Era Smart AI Chat & Assistant',
    description: 'Chat with Nexara AI, an advanced AI platform by Pretom Biswas featuring real-time Google search, code artifacts, and multimodal intelligence.',
    canonical: 'https://ainexara.com/',
    ogTitle: 'Nexara AI – Next Era Smart AI Chat & Assistant',
    ogDescription: 'Chat with Nexara AI with real-time web search grounding, interactive code artifacts, and instant multilingual responses.'
  },
  dashboard: {
    title: 'AI Tools & Models – Nexara AI Platform',
    description: 'Explore state-of-the-art AI tools including code generator, content creator, dictionary, text summarizer, and brainstorming assistant.',
    canonical: 'https://ainexara.com/dashboard',
    ogTitle: 'AI Tools & Models – Nexara AI Platform',
    ogDescription: 'Access specialized AI productivity tools for writing, coding, summarization, and data analysis in Nexara AI.'
  },
  'content-maker': {
    title: 'Content Maker & AI Writer – Nexara AI',
    description: 'Generate high-quality blog posts, social media captions, marketing copy, and articles instantly with Nexara AI Content Maker.',
    canonical: 'https://ainexara.com/content-maker',
    ogTitle: 'Content Maker & AI Writer – Nexara AI',
    ogDescription: 'Create engaging articles, social posts, emails, and essays with smart AI prompts and instant copy tools.'
  },
  dictionary: {
    title: 'Smart Dictionary & Vocabulary Assistant – Nexara AI',
    description: 'Look up word meanings, definitions, pronunciations, synonyms, and translations instantly with Nexara AI Dictionary.',
    canonical: 'https://ainexara.com/dictionary',
    ogTitle: 'Smart Dictionary & Vocabulary Assistant – Nexara AI',
    ogDescription: 'Instant definitions, example sentences, parts of speech, and Bengali/English translations.'
  },
  settings: {
    title: 'Account Settings & Preferences – Nexara AI',
    description: 'Manage your Nexara AI account, custom API keys, model preferences, dark/light theme, and language settings.',
    canonical: 'https://ainexara.com/settings',
    ogTitle: 'Account Settings & Preferences – Nexara AI',
    ogDescription: 'Customize your Nexara AI chat settings, custom API keys, and preference options.'
  },
  admin: {
    title: 'Admin Control Panel – Nexara AI',
    description: 'Nexara AI platform management, user administration, and system controls.',
    canonical: 'https://ainexara.com/admin',
    ogTitle: 'Admin Control Panel – Nexara AI',
    ogDescription: 'Nexara AI administrative management console.'
  },
  login: {
    title: 'Sign In to Nexara AI – Next-Gen AI Assistant',
    description: 'Sign in or create an account to access Nexara AI chat, custom tools, personal memory, and fast AI models.',
    canonical: 'https://ainexara.com/login',
    ogTitle: 'Sign In to Nexara AI – Next-Gen AI Assistant',
    ogDescription: 'Join Nexara AI to experience next-generation artificial intelligence, real-time web search, and custom tools.'
  }
};

export default function SEOHead({ screenKey }: SEOHeadProps) {
  useEffect(() => {
    const meta = PAGE_METADATA[screenKey] || PAGE_METADATA.chat;

    // Update document title
    document.title = meta.title;

    // Helper function to update meta tag by property or name
    const updateMetaTag = (selector: string, attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Helper to update canonical link
    const updateCanonical = (url: string) => {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', url);
    };

    // Apply primary meta tags
    updateMetaTag('meta[name="description"]', 'name', 'description', meta.description);
    updateMetaTag('meta[property="og:title"]', 'property', 'og:title', meta.ogTitle);
    updateMetaTag('meta[property="og:description"]', 'property', 'og:description', meta.ogDescription);
    updateMetaTag('meta[property="og:url"]', 'property', 'og:url', meta.canonical);
    updateMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', meta.ogTitle);
    updateMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', meta.ogDescription);
    updateCanonical(meta.canonical);

  }, [screenKey]);

  return null;
}
