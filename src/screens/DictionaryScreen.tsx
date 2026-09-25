import React, { useState, useRef } from 'react';
import { 
  Book, 
  Search, 
  ArrowLeft, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  MessageSquare, 
  Sparkles, 
  AlertCircle, 
  Languages, 
  Quote, 
  Tags, 
  RotateCcw,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';
import WaveformIndicator from '../components/WaveformIndicator';

export interface DictionaryScreenProps {
  onBack?: () => void;
  onSendToChat?: (content: string) => void;
}

export interface WordDefinition {
  word: string;
  pronunciation?: string;
  partOfSpeech?: string;
  meaning: string;
  example?: string;
  synonyms?: string[];
  targetLanguage?: string;
}

const SUPPORTED_TARGET_LANGUAGES = [
  { code: 'bn', label: 'Meaning in বাংলা', name: 'বাংলা', badgeText: 'বাংলা অর্থ' },
  { code: 'en', label: 'Meaning in English', name: 'English', badgeText: 'English Definition' },
  { code: 'hi', label: 'Meaning in हिन्दी', name: 'हिन्दी', badgeText: 'हिन्दी अर्थ' },
  { code: 'es', label: 'Meaning in Español', name: 'Español', badgeText: 'Significado en Español' },
  { code: 'fr', label: 'Meaning in Français', name: 'Français', badgeText: 'Définition en Français' },
  { code: 'zh', label: 'Meaning in 中文', name: '中文', badgeText: '中文含义' },
  { code: 'de', label: 'Meaning in Deutsch', name: 'Deutsch', badgeText: 'Bedeutung auf Deutsch' },
  { code: 'ar', label: 'Meaning in العربية', name: 'العربية', badgeText: 'المعنى بالعربية' },
];

const SUGGESTED_WORDS = [
  'resilience',
  'serendipity',
  'ephemeral',
  'eloquent',
  'ubiquitous',
  'pragmatic',
  'empathy'
];

function extractDictionaryData(rawText: string, fallbackWord: string): WordDefinition | null {
  if (!rawText) return null;

  // 1. Strip markdown code blocks if present
  let cleanText = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/gi, '')
    .replace(/```/g, '')
    .trim();

  // Helper to construct normalized definition object
  const normalize = (data: any): WordDefinition | null => {
    if (!data || typeof data !== 'object') return null;
    const meaning = data.meaning || data.definition || data.meaningInBengali || data.bengaliMeaning;
    if (!meaning) return null;

    let synonyms: string[] = [];
    if (Array.isArray(data.synonyms)) {
      synonyms = data.synonyms.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof data.synonyms === 'string') {
      synonyms = data.synonyms.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    return {
      word: data.word || fallbackWord,
      pronunciation: data.pronunciation || data.ipa || '',
      partOfSpeech: data.partOfSpeech || data.part_of_speech || data.pos || '',
      meaning: String(meaning).trim(),
      example: data.example || data.exampleSentence || data.sentence || '',
      synonyms
    };
  };

  // 2. Direct JSON.parse
  try {
    const directParsed = JSON.parse(cleanText);
    const res = normalize(directParsed);
    if (res) return res;
  } catch {}

  // 3. Extract { ... } outer boundaries
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = cleanText.substring(firstBrace, lastBrace + 1);
    try {
      const braceParsed = JSON.parse(jsonSubstring);
      const res = normalize(braceParsed);
      if (res) return res;
    } catch {}

    // 4. Clean trailing commas & smart quotes
    try {
      const sanitizedJson = jsonSubstring
        .replace(/,\s*([\}\]])/g, '$1') // remove trailing commas
        .replace(/[\u201C\u201D]/g, '"') // replace curly double quotes
        .replace(/[\u2018\u2019]/g, "'"); // replace curly single quotes
      const sanitizedParsed = JSON.parse(sanitizedJson);
      const res = normalize(sanitizedParsed);
      if (res) return res;
    } catch {}
  }

  // 5. Fallback Regex field extraction if JSON has unescaped quotes or line breaks
  try {
    const wordMatch = cleanText.match(/"word"\s*:\s*"([^"]+)"/i);
    const pronunciationMatch = cleanText.match(/"(?:pronunciation|ipa)"\s*:\s*"([^"]+)"/i);
    const posMatch = cleanText.match(/"(?:partOfSpeech|part_of_speech|pos)"\s*:\s*"([^"]+)"/i);
    const meaningMatch = cleanText.match(/"(?:meaning|definition)"\s*:\s*"([^"]+)"/i);
    const exampleMatch = cleanText.match(/"(?:example|exampleSentence|sentence)"\s*:\s*"([^"]+)"/i);

    let synonyms: string[] = [];
    const synonymsBlock = cleanText.match(/"synonyms"\s*:\s*\[([\s\S]*?)\]/i);
    if (synonymsBlock && synonymsBlock[1]) {
      const extractedSyns = synonymsBlock[1].match(/"([^"]+)"/g);
      if (extractedSyns) {
        synonyms = extractedSyns.map(s => s.replace(/"/g, '').trim()).filter(Boolean);
      }
    }

    if (meaningMatch && meaningMatch[1]) {
      return {
        word: wordMatch ? wordMatch[1] : fallbackWord,
        pronunciation: pronunciationMatch ? pronunciationMatch[1] : '',
        partOfSpeech: posMatch ? posMatch[1] : '',
        meaning: meaningMatch[1],
        example: exampleMatch ? exampleMatch[1] : '',
        synonyms
      };
    }
  } catch (e) {
    console.warn('Regex fallback failed:', e);
  }

  return null;
}

export default function DictionaryScreen({ onBack, onSendToChat }: DictionaryScreenProps) {
  const { language } = useLanguage();

  // Inputs
  const [searchTerm, setSearchTerm] = useState('');
  const [targetLang, setTargetLang] = useState<string>(
    language === 'bn' ? 'bn' : 'en'
  );

  // Status & Data
  const [searchError, setSearchError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WordDefinition | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultCardRef = useRef<HTMLDivElement>(null);

  const handleSearchWord = async (wordToSearch?: string) => {
    const query = (wordToSearch !== undefined ? wordToSearch : searchTerm).trim();

    if (!query) {
      setSearchError(language === 'bn' ? 'দয়া করে একটি শব্দ লিখুন' : 'Enter a word first');
      searchInputRef.current?.focus();
      return;
    }

    setSearchError('');
    setGeneralError(null);
    setIsLoading(true);

    if (wordToSearch !== undefined) {
      setSearchTerm(wordToSearch);
    }

    const selectedTarget = SUPPORTED_TARGET_LANGUAGES.find(l => l.code === targetLang) || SUPPORTED_TARGET_LANGUAGES[0];

    const prompt = `Give the meaning, pronunciation (IPA), part of speech, one example sentence, and 3 synonyms for the English word '${query}'. Provide the meaning/definition in ${selectedTarget.name}. Respond in a strict JSON format with keys: word, pronunciation, partOfSpeech, meaning, example, synonyms (array). Do not include markdown code block backticks, just the raw JSON object.`;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          language,
          systemPromptOverride: "You are an authoritative multilingual lexicographer and dictionary assistant. You must respond strictly and exclusively with a valid JSON object matching the requested schema: { word: string, pronunciation: string, partOfSpeech: string, meaning: string, example: string, synonyms: string[] }. Do not add any markdown formatting or any text before or after.",
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let replyText = '';

      if (contentType.includes('text/event-stream') && response.body) {
        // SSE stream response handling
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let streamedAccumulator = '';
        let finalReply = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.reply) {
                finalReply = data.reply;
              } else if (data.chunk) {
                streamedAccumulator += data.chunk;
              }
            } catch {}
          }
        }
        replyText = finalReply || streamedAccumulator;
      } else if (contentType.includes('application/json')) {
        const json = await response.json();
        replyText = json.reply || json.text || '';
      } else {
        const rawText = await response.text();
        // Check if rawText contains SSE lines (data: {...})
        if (rawText.includes('data: ')) {
          let sseChunkAccumulator = '';
          let sseFinalReply = '';
          const lines = rawText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const parsedSse = JSON.parse(trimmed.slice(6));
                if (parsedSse.reply) {
                  sseFinalReply = parsedSse.reply;
                } else if (parsedSse.chunk) {
                  sseChunkAccumulator += parsedSse.chunk;
                }
              } catch {}
            }
          }
          replyText = sseFinalReply || sseChunkAccumulator || rawText;
        } else {
          try {
            const parsed = JSON.parse(rawText);
            replyText = parsed.reply || parsed.text || rawText;
          } catch {
            replyText = rawText;
          }
        }
      }

      const parsedResult = extractDictionaryData(replyText, query);

      if (!parsedResult || !parsedResult.meaning) {
        console.warn('Could not extract dictionary data from raw response:', replyText);
        throw new Error('Incomplete or unparseable dictionary response');
      }

      const formattedResult: WordDefinition = {
        ...parsedResult,
        targetLanguage: selectedTarget.badgeText
      };

      setResult(formattedResult);

      setTimeout(() => {
        resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);

    } catch (err: any) {
      console.error('Dictionary search error:', err);
      setGeneralError(
        language === 'bn' 
          ? "শব্দটি খুঁজে পাওয়া যায়নি। দয়া করে আবার চেষ্টা করুন।" 
          : "Couldn't find that word. Try again."
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const playPronunciation = (wordToSpeak: string) => {
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(wordToSpeak);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      
      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Audio playback error:', err);
      setIsPlayingAudio(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const textToCopy = `${result.word} (${result.pronunciation || ''}) [${result.partOfSpeech || ''}]\n\nMeaning: ${result.meaning}\n\nExample: "${result.example}"\n\nSynonyms: ${result.synonyms?.join(', ')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleSendToChat = () => {
    if (!result || !onSendToChat) return;
    const chatMsg = `Tell me more about the word "${result.word}" (${result.pronunciation || ''}), including its etymology, advanced usage in sentences, and nuances compared to: ${result.synonyms?.join(', ')}.`;
    onSendToChat(chatMsg);
  };

  return (
    <div className="relative p-3 sm:p-6 md:p-8 lg:p-12 h-full overflow-y-auto overflow-x-hidden w-full scroll-smooth">
      {/* Signature ambient background glow (purple-to-pink) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[600px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-[#7C5CFC]/40 via-[#b347cf]/40 to-[#E345A8]/40 blur-[130px] rounded-full mix-blend-screen animate-pulse" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10 pt-2 sm:pt-4 pb-28">
        {/* Navigation Breadcrumb */}
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
                {language === 'bn' ? 'অভিধান' : 'Dictionary'}
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-[var(--text-muted)] w-fit backdrop-blur-md">
            <Languages size={13} className="text-[#E345A8]" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] font-semibold">
              {language === 'bn' ? 'বহুভাষিক ভোকাবুলারি' : 'Multilingual Vocabulary'}
            </span>
          </div>
        </div>

        {/* Hero Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-[var(--text)] tracking-tight mb-2 flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#7C5CFC] via-[#A855F7] to-[#E345A8] flex items-center justify-center text-white shadow-lg shadow-[#7C5CFC]/25 shrink-0">
              <Book className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span>{language === 'bn' ? 'স্মার্ট অভিধান' : 'Dictionary'}</span>
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-muted)] font-normal max-w-2xl leading-relaxed">
            {language === 'bn' 
              ? 'যেকোনো ভাষার শব্দের অর্থ, সঠিক আন্তর্জাতিক ফোনেটিক উচ্চারণ (IPA), উদাহরণ ও প্রতিশব্দ জানুন।'
              : 'Look up word meanings in any language with IPA phonetics, audio, examples and synonyms.'}
          </p>
        </div>

        {/* STEP 3 (a): Search Row Container */}
        <div className="rounded-3xl bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] p-5 sm:p-6 shadow-[var(--shadow-premium)] mb-8 relative">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchWord();
            }}
            className="flex flex-col md:flex-row items-stretch md:items-center gap-3"
          >
            {/* Word Search Input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                <Search size={18} />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (searchError) setSearchError('');
                }}
                placeholder={language === 'bn' ? 'একটি শব্দ লিখুন (যেমন: resilience)...' : 'Search a word...'}
                className={`w-full pl-11 pr-4 py-3.5 bg-white/[0.04] border rounded-full text-sm sm:text-base text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none transition-all shadow-inner ${
                  searchError
                    ? 'border-rose-500/60 focus:ring-2 focus:ring-rose-500/30'
                    : 'border-white/10 focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20'
                }`}
              />
            </div>

            {/* Target Language Dropdown */}
            <div className="relative md:w-56">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full appearance-none px-4 py-3.5 bg-white/[0.04] border border-white/10 rounded-full text-xs sm:text-sm text-[var(--text)] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/30 hover:border-white/20 transition-all cursor-pointer shadow-inner pr-10"
              >
                {SUPPORTED_TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-[#0F0F13] text-white">
                    {lang.label}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-[var(--text-muted)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Search Button (App's Signature Gradient, Pill-Shaped) */}
            <button
              type="submit"
              disabled={isLoading}
              className="py-3.5 px-7 rounded-full bg-gradient-to-r from-[#7C5CFC] via-[#b347cf] to-[#E345A8] hover:opacity-95 text-white font-semibold text-sm sm:text-base shadow-lg shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
            >
              {isLoading ? (
                <>
                  <Sparkles size={18} className="animate-spin" />
                  <span>{language === 'bn' ? 'খোঁজা হচ্ছে...' : 'Searching...'}</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>{language === 'bn' ? 'অনুসন্ধান' : 'Search'}</span>
                </>
              )}
            </button>
          </form>

          {/* Inline Validation Error */}
          {searchError && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 px-3 flex items-center gap-1.5 text-xs text-rose-400 font-medium"
            >
              <AlertCircle size={13} />
              <span>{searchError}</span>
            </motion.div>
          )}

          {/* Quick Suggestions Tags */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {language === 'bn' ? 'জনপ্রিয় শব্দসমূহ:' : 'Popular words:'}
            </span>
            {SUGGESTED_WORDS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => handleSearchWord(w)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-[var(--text)] border border-white/[0.08] transition-all cursor-pointer active:scale-95"
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-14 flex flex-col items-center justify-center text-center rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <WaveformIndicator label={language === 'bn' ? 'শব্দটির অর্থ খোঁজা হচ্ছে...' : `Looking up definition for "${searchTerm}"...`} />
            <p className="text-xs text-[var(--text-muted)] mt-4">
              {language === 'bn' 
                ? 'আইপিএ উচ্চারণ, অর্থ ও উদাহরণ প্রস্তুত করা হচ্ছে...' 
                : 'Fetching phonetics, parts of speech, and contextual meanings...'}
            </p>
          </div>
        )}

        {/* General Error State */}
        {generalError && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center flex flex-col items-center justify-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle size={20} />
            </div>
            <p className="text-sm font-medium text-rose-300">
              {generalError}
            </p>
            <button
              onClick={() => handleSearchWord()}
              className="mt-1 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-[var(--text)] transition-all cursor-pointer"
            >
              {language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
            </button>
          </motion.div>
        )}

        {/* STEP 3 (b): Result Card */}
        <div ref={resultCardRef}>
          <AnimatePresence>
            {result && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="rounded-3xl bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] p-6 sm:p-8 shadow-[var(--shadow-premium)] relative overflow-hidden"
              >
                {/* Accent ambient corner glow */}
                <div className="absolute -top-24 -right-24 w-60 h-60 bg-gradient-to-br from-[#7C5CFC] via-[#A855F7] to-[#E345A8] rounded-full blur-[80px] opacity-15 pointer-events-none" />

                {/* Top Row: Word, Pronunciation, Part of speech, Audio playback, Target language badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-[var(--glass-border)] relative z-10">
                  <div className="space-y-2">
                    {/* Word title (bold 28px) */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-[var(--text)] tracking-tight capitalize">
                        {result.word}
                      </h2>

                      {/* Pronunciation audio button */}
                      <button
                        onClick={() => playPronunciation(result.word)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                          isPlayingAudio
                            ? 'bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] text-white shadow-md shadow-[#7C5CFC]/30 scale-105 animate-pulse'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-[var(--text)] border border-white/10 hover:border-white/20'
                        }`}
                        title="Play pronunciation audio"
                      >
                        <Volume2 size={17} />
                      </button>

                      {/* Part of Speech Pill */}
                      {result.partOfSpeech && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/[0.06] text-[var(--text-muted)] border border-white/10 italic">
                          {result.partOfSpeech}
                        </span>
                      )}
                    </div>

                    {/* Pronunciation IPA */}
                    {result.pronunciation && (
                      <div className="flex items-center gap-2 text-sm sm:text-base font-mono text-[#818cf8]">
                        <span>{result.pronunciation}</span>
                      </div>
                    )}
                  </div>

                  {/* Badges & Actions */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    {/* Language Badge */}
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-[#7C5CFC]/20 to-[#E345A8]/20 text-[#c084fc] border border-[#7C5CFC]/30 shadow-sm whitespace-nowrap">
                      {result.targetLanguage || 'Meaning'}
                    </span>

                    {/* Copy Button */}
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-[var(--text)] transition-all active:scale-95 cursor-pointer shadow-sm"
                      title="Copy meaning"
                    >
                      {copied ? (
                        <>
                          <Check size={14} className="text-emerald-400" />
                          <span className="text-emerald-400">{language === 'bn' ? 'কপি হয়েছে' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>{language === 'bn' ? 'কপি' : 'Copy'}</span>
                        </>
                      )}
                    </button>

                    {/* Send to chat */}
                    {onSendToChat && (
                      <button
                        onClick={handleSendToChat}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] hover:opacity-90 text-xs font-medium text-white transition-all active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
                        title="Discuss in Chat screen"
                      >
                        <MessageSquare size={14} />
                        <span>{language === 'bn' ? 'চ্যাটে পাঠান' : 'Send to chat'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Section: Meaning / Definition */}
                <div className="mb-6 relative z-10">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    {language === 'bn' ? 'অর্থ ও সংজ্ঞা' : 'Meaning & Definition'}
                  </div>
                  <p className="text-base sm:text-lg md:text-xl text-[var(--text)] leading-relaxed font-normal">
                    {result.meaning}
                  </p>
                </div>

                {/* Section: Example Sentence */}
                {result.example && (
                  <div className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] relative z-10">
                    <div className="flex items-start gap-3">
                      <Quote size={18} className="text-[#7C5CFC] shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">
                          {language === 'bn' ? 'উদাহরণ বাক্য' : 'Example Sentence'}
                        </div>
                        <p className="text-sm sm:text-base text-[var(--text)] italic leading-relaxed">
                          "{result.example}"
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section: Synonyms */}
                {result.synonyms && result.synonyms.length > 0 && (
                  <div className="relative z-10 pt-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                      <Tags size={14} className="text-[#E345A8]" />
                      <span>{language === 'bn' ? 'সমার্থক শব্দ (Synonyms)' : 'Synonyms'}</span>
                      <span className="text-[10px] lowercase normal-case opacity-60">
                        ({language === 'bn' ? 'ক্লিক করে অর্থ দেখুন' : 'click to look up'})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.synonyms.map((syn, index) => (
                        <button
                          key={index}
                          onClick={() => handleSearchWord(syn)}
                          className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-white/[0.04] hover:bg-white/[0.1] text-[var(--text)] border border-white/10 hover:border-[#7C5CFC]/40 transition-all cursor-pointer active:scale-95 group flex items-center gap-1.5"
                          title={`Look up "${syn}"`}
                        >
                          <span>{syn}</span>
                          <ExternalLink size={11} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
