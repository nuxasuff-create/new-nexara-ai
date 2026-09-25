import React, { useState, useRef } from 'react';
import { 
  FileText, 
  BookOpen, 
  Sparkles, 
  Mail, 
  Megaphone, 
  ArrowLeft, 
  Copy, 
  Check, 
  MessageSquare, 
  RotateCcw, 
  AlertCircle,
  Clock,
  Layers,
  CheckCircle2,
  Wand2,
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '../context/LanguageContext';
import WaveformIndicator from '../components/WaveformIndicator';
import SmoothWritingText from '../components/SmoothWritingText';

export interface ContentMakerScreenProps {
  onBack?: () => void;
  onSendToChat?: (content: string) => void;
  onUpgradeClick?: () => void;
}

type TemplateType = 'blog' | 'social' | 'email' | 'ad';
type ToneType = 'Friendly' | 'Professional' | 'Persuasive' | 'Playful';
type LengthType = 'Short ~300 words' | 'Medium ~700 words' | 'Long ~1500 words';

interface TemplateOption {
  id: TemplateType;
  name: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface ParsedContentResult {
  mainContent: string;
  hashtags: string[];
}

function parseGeneratedContentAndHashtags(rawText: string, hashtagsRequested: boolean): ParsedContentResult {
  if (!rawText) {
    return { mainContent: '', hashtags: [] };
  }

  if (!hashtagsRequested) {
    return { mainContent: rawText, hashtags: [] };
  }

  // 1. Check if model returned JSON
  try {
    let cleanJson = rawText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleanJson);
    if (parsed && typeof parsed === 'object') {
      const content = parsed.content || parsed.mainContent || parsed.text || '';
      let tags: string[] = [];
      if (Array.isArray(parsed.hashtags)) {
        tags = parsed.hashtags.map((h: any) => {
          const s = String(h).trim();
          return s.startsWith('#') ? s : `#${s}`;
        }).filter(Boolean);
      }
      if (content || tags.length > 0) {
        return { mainContent: content || rawText, hashtags: tags };
      }
    }
  } catch {}

  // 2. Check for explicit delimiters: ---HASHTAGS--- or [HASHTAGS] or ### Hashtags or **Hashtags:**
  const delimiterRegex = /(?:^|\n)(?:---+HASHTAGS---+|\[HASHTAGS\]|#{2,4}\s*(?:Viral\s*)?Hashtags|\*{1,2}(?:Viral\s*)?Hashtags:\*{1,2}|Hashtags:)\s*\n?/i;
  const match = rawText.match(delimiterRegex);

  if (match && match.index !== undefined) {
    const mainContent = rawText.substring(0, match.index).trim();
    const hashtagSection = rawText.substring(match.index + match[0].length).trim();
    
    // Extract hashtags (#word or space-separated list)
    const tagsFromRegex = hashtagSection.match(/#[a-zA-Z0-9_\u0980-\u09FF]+/g);
    let extractedTags: string[] = [];
    if (tagsFromRegex && tagsFromRegex.length > 0) {
      extractedTags = Array.from(new Set(tagsFromRegex));
    } else {
      extractedTags = hashtagSection
        .split(/[\s,]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => t.startsWith('#') ? t : `#${t}`);
    }

    return {
      mainContent: mainContent || rawText,
      hashtags: extractedTags
    };
  }

  // 3. Fallback: check if the text ends with 3+ hashtags
  const endHashtagMatch = rawText.match(/((?:#[a-zA-Z0-9_\u0980-\u09FF]+\s*){3,})$/);
  if (endHashtagMatch && endHashtagMatch.index !== undefined) {
    const mainContent = rawText.substring(0, endHashtagMatch.index).trim();
    const tags = endHashtagMatch[0].match(/#[a-zA-Z0-9_\u0980-\u09FF]+/g) || [];
    if (tags.length > 0) {
      return {
        mainContent: mainContent || rawText,
        hashtags: Array.from(new Set(tags))
      };
    }
  }

  return {
    mainContent: rawText,
    hashtags: []
  };
}

export default function ContentMakerScreen({
  onBack,
  onSendToChat,
  onUpgradeClick
}: ContentMakerScreenProps) {
  const { language } = useLanguage();

  // Form states
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('blog');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<ToneType>('Professional');
  const [length, setLength] = useState<LengthType>('Medium ~700 words');
  const [keywords, setKeywords] = useState('');

  // Validation states
  const [topicError, setTopicError] = useState('');
  const [templateError, setTemplateError] = useState('');

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');

  // Hashtags toggle and results
  const [includeHashtags, setIncludeHashtags] = useState(false);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedSingleTag, setCopiedSingleTag] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const templates: TemplateOption[] = [
    {
      id: 'blog',
      name: 'Blog post',
      label: language === 'bn' ? 'ব্লগ পোস্ট' : 'Blog post',
      icon: <BookOpen className="w-5 h-5" />,
      description: language === 'bn' ? 'তথ্যবহুল আর্টিকেল ও গাইড' : 'Informative articles & deep dives'
    },
    {
      id: 'social',
      name: 'Social caption',
      label: language === 'bn' ? 'সোশ্যাল ক্যাপশন' : 'Social caption',
      icon: <Sparkles className="w-5 h-5" />,
      description: language === 'bn' ? 'ইনস্টাগ্রাম, লিংকডইন ও এক্স পোস্ট' : 'Engaging captions with hashtags'
    },
    {
      id: 'email',
      name: 'Email',
      label: language === 'bn' ? 'ইমেইল' : 'Email',
      icon: <Mail className="w-5 h-5" />,
      description: language === 'bn' ? 'পেশাদার ও ফ্রেন্ডলি বার্তা' : 'Professional newsletters & outreach'
    },
    {
      id: 'ad',
      name: 'Ad copy',
      label: language === 'bn' ? 'অ্যাড কপি' : 'Ad copy',
      icon: <Megaphone className="w-5 h-5" />,
      description: language === 'bn' ? 'হাই-কনভার্টিং হেডলাইন ও অফার' : 'Compelling hooks & CTR copy'
    }
  ];

  const toneOptions: ToneType[] = ['Friendly', 'Professional', 'Persuasive', 'Playful'];
  const lengthOptions: LengthType[] = ['Short ~300 words', 'Medium ~700 words', 'Long ~1500 words'];

  const validate = () => {
    let isValid = true;

    if (!selectedTemplate) {
      setTemplateError(language === 'bn' ? 'দয়া করে একটি টেমপ্লেট নির্বাচন করুন' : 'Please select a template first');
      isValid = false;
    } else {
      setTemplateError('');
    }

    if (!topic.trim()) {
      setTopicError(language === 'bn' ? 'দয়া করে একটি টপিক লিখুন' : 'Enter a topic first');
      isValid = false;
    } else {
      setTopicError('');
    }

    return isValid;
  };

  const handleGenerate = async () => {
    if (!validate()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setIsThinking(true);
    setGeneratedContent('');
    setStreamedText('');
    setGeneratedHashtags([]);
    setCopied(false);
    setCopiedHashtags(false);
    setCopiedSingleTag(null);

    // Smooth scroll to result area
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);

    const templateObj = templates.find((t) => t.id === selectedTemplate);
    const templateName = templateObj ? templateObj.name : 'Content';

    // Form structured prompt
    let prompt = `Write a ${length} ${templateName} about ${topic.trim()} in a ${tone} tone.${
      keywords.trim() ? ` Include these keywords naturally: ${keywords.trim()}.` : ''
    }`;

    if (includeHashtags) {
      prompt += `\n\nAfter writing the content, also suggest 5-8 relevant, trending hashtags suitable for social media virality for this topic/platform. Return them separately, clearly marked with a section delimiter:\n---HASHTAGS---\n#tag1 #tag2 #tag3 #tag4 #tag5`;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          language,
          systemPromptOverride: `You are an elite, world-class copywriter and content strategist specialized in creating ${templateName}. Deliver well-structured, compelling, and ready-to-publish content that strictly adheres to the requested ${tone} tone and ${length}. Use proper markdown formatting with headers, lists, and spacing where suitable. Do not include unnecessary conversational filler before or after the content.${
            includeHashtags
              ? ' Provide the main content first, then a separate line with "---HASHTAGS---", followed by 5-8 trending viral hashtags.'
              : ''
          }`,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      let fullReply = '';

      if (contentType && contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.chunk) {
                if (isThinking) setIsThinking(false);
                fullReply += data.chunk;
                setStreamedText(fullReply);

                if (includeHashtags && (fullReply.includes('---HASHTAGS---') || fullReply.includes('[HASHTAGS]'))) {
                  const { hashtags: liveTags } = parseGeneratedContentAndHashtags(fullReply, true);
                  if (liveTags.length > 0) {
                    setGeneratedHashtags(liveTags);
                  }
                }
              }
            } catch (e) {
              // ignore partial json chunk
            }
          }
        }
      } else {
        const json = await response.json();
        fullReply = json.reply || json.text || '';
        setStreamedText(fullReply);
      }

      const { mainContent: finalContent, hashtags: finalHashtags } = parseGeneratedContentAndHashtags(fullReply, includeHashtags);
      setGeneratedContent(finalContent);
      if (finalHashtags.length > 0) {
        setGeneratedHashtags(finalHashtags);
      }
      setIsThinking(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Content generation error:', err);
      const fallbackMsg = language === 'bn' 
        ? 'দুঃখিত, কন্টেন্ট তৈরি করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।' 
        : 'Failed to generate content. Please try again.';
      setGeneratedContent(fallbackMsg);
      setStreamedText(fallbackMsg);
      setGeneratedHashtags([]);
      setIsThinking(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // Derive parsed display content and hashtags
  const currentParsed = parseGeneratedContentAndHashtags(
    isGenerating ? streamedText : (generatedContent || streamedText),
    includeHashtags
  );
  const displayContent = currentParsed.mainContent;
  const displayHashtags = generatedHashtags.length > 0 ? generatedHashtags : currentParsed.hashtags;

  const handleCopy = () => {
    const content = displayContent;
    if (!content) return;
    const textToCopy = (includeHashtags && displayHashtags.length > 0)
      ? `${content}\n\n${displayHashtags.join(' ')}`
      : content;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleCopyHashtags = () => {
    if (displayHashtags.length === 0) return;
    navigator.clipboard.writeText(displayHashtags.join(' '));
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 2200);
  };

  const handleCopySingleHashtag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedSingleTag(tag);
    setTimeout(() => setCopiedSingleTag(null), 1800);
  };

  const handleSendToChatClick = () => {
    const content = displayContent;
    if (content && onSendToChat) {
      const textToSend = (includeHashtags && displayHashtags.length > 0)
        ? `${content}\n\n${displayHashtags.join(' ')}`
        : content;
      onSendToChat(textToSend);
    }
  };

  const currentTemplate = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="relative p-3 sm:p-6 md:p-8 lg:p-12 h-full overflow-y-auto overflow-x-hidden w-full scroll-smooth">
      {/* Ambient signature background glow (purple-to-pink) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[600px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-[#7C5CFC]/40 via-[#b347cf]/40 to-[#E345A8]/40 blur-[130px] rounded-full mix-blend-screen animate-pulse" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10 pt-2 sm:pt-4 pb-28">
        {/* Navigation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs sm:text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <ArrowLeft size={16} />
                <span>{language === 'bn' ? 'এআই টুলস' : 'AI Tools'}</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">/</span>
              <span className="text-xs font-semibold text-[#7C5CFC]">
                {language === 'bn' ? 'কন্টেন্ট মেকার' : 'Content Maker'}
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-[var(--text-muted)] w-fit backdrop-blur-md">
            <Wand2 size={13} className="text-[#E345A8]" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] font-semibold">
              {language === 'bn' ? 'এআই কন্টেন্ট ইঞ্জিন' : 'AI Content Engine'}
            </span>
          </div>
        </div>

        {/* Hero Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-[var(--text)] tracking-tight mb-2 flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#7C5CFC] via-[#A855F7] to-[#E345A8] flex items-center justify-center text-white shadow-lg shadow-[#7C5CFC]/25 shrink-0">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span>{language === 'bn' ? 'কন্টেন্ট মেকার' : 'Content Maker'}</span>
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-muted)] font-normal max-w-2xl leading-relaxed">
            {language === 'bn' 
              ? 'ব্লগ পোস্ট, সোশ্যাল ক্যাপশন, ইমেইল ও অ্যাড কপি নিমেষেই লিখুন এবং তৈরি করুন।'
              : 'Write blog posts, captions, emails and more with high precision AI copywriting.'}
          </p>
        </div>

        {/* STEP 3 (a): Template Selection Grid (auto-fit, minmax 140px) */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3.5">
            <label className="text-xs sm:text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <Layers size={15} className="text-[#7C5CFC]" />
              <span>{language === 'bn' ? '১. টেমপ্লেট নির্বাচন করুন' : '1. Select Template'}</span>
            </label>
            {templateError && (
              <span className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <AlertCircle size={12} />
                {templateError}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {templates.map((tmpl) => {
              const isSelected = selectedTemplate === tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => {
                    setSelectedTemplate(tmpl.id);
                    setTemplateError('');
                  }}
                  className={`relative p-[1.5px] rounded-2xl transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#7C5CFC] via-[#b347cf] to-[#E345A8] shadow-lg shadow-[#7C5CFC]/25 scale-[1.02]'
                      : 'bg-white/10 hover:bg-white/20 hover:scale-[1.01]'
                  }`}
                >
                  <div
                    className={`h-full rounded-[14.5px] p-4 flex flex-col justify-between transition-colors ${
                      isSelected
                        ? 'bg-[var(--card)]/95 backdrop-blur-xl'
                        : 'bg-[var(--card)]/80 backdrop-blur-md hover:bg-[var(--card)]/90'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-gradient-to-br from-[#7C5CFC] to-[#E345A8] text-white shadow-md shadow-[#7C5CFC]/30'
                              : 'bg-white/[0.06] text-[var(--text-muted)]'
                          }`}
                        >
                          {tmpl.icon}
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] flex items-center justify-center text-white shadow-sm">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      <div className="font-bold text-sm text-[var(--text)] mb-1">
                        {tmpl.label}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {tmpl.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 3 (b): Form Card */}
        <div className="rounded-3xl bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] p-6 sm:p-8 shadow-[var(--shadow-premium)] mb-10 relative overflow-hidden">
          <div className="space-y-6">
            {/* Field: Topic */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs sm:text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <span>{language === 'bn' ? 'টপিক বা বিষয়বস্তু *' : 'Topic *'}</span>
                </label>
                {topicError && (
                  <span className="text-xs text-rose-400 font-medium flex items-center gap-1">
                    <AlertCircle size={12} />
                    {topicError}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (topicError) setTopicError('');
                }}
                placeholder={
                  language === 'bn'
                    ? 'উদাহরণ: ছোট টিমের জন্য রিমোট ওয়ার্কের সুবিধা'
                    : 'Benefits of remote work for small teams'
                }
                className={`w-full px-5 py-3.5 bg-white/[0.04] border rounded-full text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none transition-all shadow-inner ${
                  topicError
                    ? 'border-rose-500/60 focus:ring-2 focus:ring-rose-500/30'
                    : 'border-white/10 focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20'
                }`}
              />
            </div>

            {/* Fields Grid: Tone & Length */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Field: Tone */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[var(--text)] mb-2">
                  {language === 'bn' ? 'টোন (Tone)' : 'Tone'}
                </label>
                <div className="relative">
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ToneType)}
                    className="w-full appearance-none px-5 py-3.5 bg-white/[0.04] border border-white/10 rounded-full text-sm text-[var(--text)] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20 transition-all cursor-pointer shadow-inner"
                  >
                    {toneOptions.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#0F0F13] text-white">
                        {opt}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Field: Length */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[var(--text)] mb-2">
                  {language === 'bn' ? 'দৈর্ঘ্য (Length)' : 'Length'}
                </label>
                <div className="relative">
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value as LengthType)}
                    className="w-full appearance-none px-5 py-3.5 bg-white/[0.04] border border-white/10 rounded-full text-sm text-[var(--text)] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20 transition-all cursor-pointer shadow-inner"
                  >
                    {lengthOptions.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#0F0F13] text-white">
                        {opt}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Field: Keywords (optional) */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[var(--text)] mb-2">
                <span>{language === 'bn' ? 'কীওয়ার্ডস (ঐচ্ছিক)' : 'Keywords (optional)'}</span>
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'উদাহরণ: remote work, productivity, small teams'
                    : 'remote work, productivity, small teams'
                }
                className="w-full px-5 py-3.5 bg-white/[0.04] border border-white/10 rounded-full text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20 transition-all shadow-inner"
              />
            </div>

            {/* Field: Include viral hashtags toggle */}
            <div className="flex items-center justify-between p-4 sm:p-4.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/15 transition-all">
              <div className="flex items-start gap-3 select-none">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors mt-0.5 ${
                    includeHashtags
                      ? 'bg-gradient-to-br from-[#7C5CFC]/25 to-[#E345A8]/25 border border-[#7C5CFC]/40 text-[#A855F7]'
                      : 'bg-white/[0.06] border border-white/10 text-[var(--text-muted)]'
                  }`}
                >
                  <Hash size={16} />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[var(--text)] flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span>{language === 'bn' ? 'ভাইরাল হ্যাশট্যাগ যোগ করুন' : 'Include viral hashtags'}</span>
                    <span className="text-[11px] font-normal text-[var(--text-muted)]">
                      {language === 'bn' ? '(কন্টেন্টের নিচে স্বয়ংক্রিয়ভাবে যোগ হবে)' : '(auto-added below the content)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                    {language === 'bn'
                      ? 'যেকোনো টেমপ্লেটের কন্টেন্টের জন্য ৫-৮টি ট্রেন্ডিং ও প্রাসঙ্গিক হ্যাশট্যাগ'
                      : '5-8 trending hashtags optimized for social reach and engagement'}
                  </p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={includeHashtags}
                onClick={() => setIncludeHashtags(!includeHashtags)}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/50 ${
                  includeHashtags
                    ? 'bg-gradient-to-r from-[#7C5CFC] to-[#E345A8]'
                    : 'bg-white/10 hover:bg-white/15'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    includeHashtags ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Action: Generate content button */}
            <div className="pt-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-4 px-8 rounded-full bg-gradient-to-r from-[#7C5CFC] via-[#b347cf] to-[#E345A8] hover:opacity-95 text-white font-semibold text-sm sm:text-base shadow-xl shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer active:scale-[0.98]"
              >
                {isGenerating ? (
                  <>
                    <Sparkles size={18} className="animate-spin" />
                    <span>{language === 'bn' ? 'কন্টেন্ট তৈরি হচ্ছে...' : 'Generating content...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="fill-current" />
                    <span>{language === 'bn' ? 'কন্টেন্ট তৈরি করুন' : 'Generate content'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 4: Generated Content Result Area */}
        <div ref={resultRef}>
          <AnimatePresence>
            {(isGenerating || generatedContent || streamedText) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="rounded-3xl bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] p-6 sm:p-8 shadow-[var(--shadow-premium)] relative overflow-hidden"
              >
                {/* Ambient glow in card corner */}
                <div className="absolute -top-24 -right-24 w-60 h-60 bg-gradient-to-br from-[#7C5CFC] via-[#A855F7] to-[#E345A8] rounded-full blur-[80px] opacity-15 pointer-events-none" />

                {/* Result Header & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-5 border-b border-[var(--glass-border)] relative z-10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#7C5CFC]/20 text-[#818cf8] border border-[#7C5CFC]/30">
                      {currentTemplate?.label}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-[var(--text-muted)] border border-white/10">
                      {tone}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-[var(--text-muted)] border border-white/10">
                      {length.split(' ')[0]}
                    </span>
                    {includeHashtags && displayHashtags.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E345A8]/15 text-[#f472b6] border border-[#E345A8]/30 flex items-center gap-1">
                        <Hash size={10} />
                        {displayHashtags.length} {language === 'bn' ? 'হ্যাশট্যাগ' : 'hashtags'}
                      </span>
                    )}
                  </div>

                  {/* Actions: Copy, Send to chat, Regenerate */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      disabled={isGenerating && !streamedText}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-[var(--text)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                      title={includeHashtags && displayHashtags.length > 0 ? 'Copy all content with hashtags' : 'Copy to clipboard'}
                    >
                      {copied ? (
                        <>
                          <Check size={14} className="text-emerald-400" />
                          <span className="text-emerald-400">{language === 'bn' ? 'কপি হয়েছে' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>
                            {includeHashtags && displayHashtags.length > 0
                              ? language === 'bn' ? 'সব কপি করুন' : 'Copy all'
                              : language === 'bn' ? 'কপি' : 'Copy'}
                          </span>
                        </>
                      )}
                    </button>

                    {onSendToChat && (
                      <button
                        onClick={handleSendToChatClick}
                        disabled={isGenerating && !streamedText}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] hover:opacity-90 text-xs font-medium text-white transition-all active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer"
                        title="Send this content to Chat screen"
                      >
                        <MessageSquare size={14} />
                        <span>{language === 'bn' ? 'চ্যাটে পাঠান' : 'Send to chat'}</span>
                      </button>
                    )}

                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="p-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[var(--text-muted)] hover:text-[var(--text)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                      title="Regenerate"
                    >
                      <RotateCcw size={14} className={isGenerating ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {/* Result Content Body */}
                <div className="relative z-10">
                  {isThinking && !streamedText ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <WaveformIndicator label={language === 'bn' ? 'কন্টেন্ট লেখা হচ্ছে...' : 'Crafting your content...'} />
                      <p className="text-xs text-[var(--text-muted)] mt-4">
                        {language === 'bn' ? 'এআই নির্দেশাবলী প্রসেস করছে...' : 'Synthesizing tone, length and keywords...'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        {isGenerating ? (
                          <div className="text-[var(--text)] text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans">
                            <SmoothWritingText text={displayContent} isStreaming={isGenerating} />
                          </div>
                        ) : (
                          <div className="markdown-body text-[var(--text)] text-sm sm:text-base leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {displayContent}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* STEP 4 & 5: Conditional Viral Hashtags Section */}
                      {includeHashtags && displayHashtags.length > 0 && (
                        <div className="mt-6 pt-5 border-t border-[var(--glass-border)]">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#7C5CFC]/20 to-[#E345A8]/20 border border-[#7C5CFC]/30 flex items-center justify-center text-[#A855F7]">
                                <Hash size={13} />
                              </div>
                              <span className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">
                                {language === 'bn' ? 'ভাইরাল হ্যাশট্যাগ' : 'Viral Hashtags'}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--text-muted)] border border-white/10 font-mono">
                                {displayHashtags.length}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={handleCopyHashtags}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-all active:scale-95 cursor-pointer"
                              title={language === 'bn' ? 'শুধুমাত্র হ্যাশট্যাগগুলো কপি করুন' : 'Copy only hashtags'}
                            >
                              {copiedHashtags ? (
                                <>
                                  <Check size={12} className="text-emerald-400" />
                                  <span className="text-emerald-400">{language === 'bn' ? 'কপি হয়েছে' : 'Copied'}</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>{language === 'bn' ? 'হ্যাশট্যাগ কপি' : 'Copy hashtags'}</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Hashtag Pills */}
                          <div className="flex flex-wrap gap-2">
                            {displayHashtags.map((tag, idx) => {
                              const isTagCopied = copiedSingleTag === tag;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleCopySingleHashtag(tag)}
                                  className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#7C5CFC]/15 via-[#A855F7]/15 to-[#E345A8]/15 hover:from-[#7C5CFC]/25 hover:to-[#E345A8]/25 border border-[#7C5CFC]/30 hover:border-[#E345A8]/50 text-xs sm:text-sm font-medium text-white/90 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                                  title={language === 'bn' ? 'কপি করতে ক্লিক করুন' : 'Click to copy'}
                                >
                                  <span className="text-[#A855F7] group-hover:text-pink-400 transition-colors">#</span>
                                  <span>{tag.replace(/^#/, '')}</span>
                                  {isTagCopied && <Check size={11} className="text-emerald-400 ml-0.5" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
