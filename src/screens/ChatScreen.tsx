import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Mic, Bot, User as UserIcon, Volume2, Square, X, Sparkles, FileText, Search, Image as ImageIcon, History, Plus, Copy, Check, Download, ArrowDown, Edit2, RotateCcw, Globe, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useLanguage } from '../context/LanguageContext';
import SmoothWritingText from '../components/SmoothWritingText';
import WaveformIndicator from '../components/WaveformIndicator';
import ChatInputBar from '../components/ChatInputBar';
import { 
  requestNotificationPermission, 
  startBackgroundGeneration, 
  updateBackgroundStatus, 
  finishBackgroundGeneration 
} from '../lib/backgroundManager';
import { extractArtifactsFromText } from '../lib/artifactExtractor';
import { FileArtifactCard } from '../components/FileArtifactCard';
import { CodePreviewDrawer } from '../components/CodePreviewDrawer';
import { exportAsMarkdown } from '../lib/fileExporter';
import { ArtifactProject, DrawerState } from '../types/artifact';

export function parseFrontendError(err: any): string {
  if (!err) return "An unknown error occurred.";
  
  let msg = "";
  if (typeof err === "string") {
    const trimmed = err.trim();
    if (trimmed === "[object Object]") return "An unexpected error occurred.";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseFrontendError(parsed);
      } catch {
        msg = trimmed;
      }
    } else {
      msg = trimmed;
    }
  } else if (typeof err === "object") {
    if (err.error) {
      return parseFrontendError(err.error);
    }
    if (typeof err.message === "string" && err.message && err.message !== "[object Object]") {
      msg = err.message;
    } else if (typeof err.message === "object" && err.message) {
      return parseFrontendError(err.message);
    } else if (typeof err.detail === "string") {
      msg = err.detail;
    } else if (typeof err.msg === "string") {
      msg = err.msg;
    } else {
      try {
        const jsonStr = JSON.stringify(err);
        if (jsonStr && jsonStr !== "{}" && jsonStr !== "[object Object]") {
          msg = jsonStr;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (!msg) {
    const str = String(err);
    msg = str !== "[object Object]" ? str : "An unexpected error occurred.";
  }

  const lower = msg.toLowerCase();
  if (lower.includes("free-models-per-day") || (lower.includes("429") && lower.includes("rate limit"))) {
    return "The default OpenRouter daily free quota has been reached. Please add your own OpenRouter API Key in Settings (⚙️) to continue seamlessly.";
  }

  return msg;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  image?: string;
  images?: string[];
  sources?: GroundingSource[];
  searchQueries?: string[];
}

interface ChatScreenProps {
  initialPrompt?: string;
  clearInitialPrompt?: () => void;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
  setCurrentScreen: (screen: string) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}

const MessageItem = React.memo(({ msg, isCurrentlySpeaking, copiedId, scrollToBottom, toggleSpeech, handleCopy, onOpenPreview, onEditUserMessage, onRetryAiMessage, language }: {
  msg: Message,
  isCurrentlySpeaking: boolean,
  copiedId: string | null,
  scrollToBottom: () => void,
  toggleSpeech: (text: string, id: string) => void,
  handleCopy: (text: string, id: string) => void,
  onOpenPreview?: (project: ArtifactProject, fileId?: string) => void,
  onEditUserMessage?: (msgId: string, newText: string) => void,
  onRetryAiMessage?: (aiMsgId: string) => void,
  language?: string
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);

  // Extract structured file artifacts (code files / project bundles)
  const artifactProject = React.useMemo(() => {
    if (msg.sender === 'ai' && msg.text) {
      return extractArtifactsFromText(msg.text, msg.id);
    }
    return null;
  }, [msg.sender, msg.text, msg.id]);

  const formattedTime = msg.timestamp ? new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format((msg.timestamp as any)?.toDate ? (msg.timestamp as any).toDate() : new Date(msg.timestamp as any)) : '';

  if (isEditing && msg.sender === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full justify-end my-2"
      >
        <div className="flex flex-col gap-2 w-full max-w-[85%] bg-[var(--card)] p-4 rounded-[20px] border border-primary/40 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-bold text-primary">
            <span className="flex items-center gap-1.5">
              <Edit2 size={13} /> {language === 'bn' ? 'মেসেজ সম্পাদনা করুন' : 'Edit Message'}
            </span>
          </div>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-medium leading-relaxed"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditText(msg.text);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (editText.trim() && editText !== msg.text) {
                  onEditUserMessage?.(msg.id, editText.trim());
                }
                setIsEditing(false);
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-md shadow-primary/20 active:scale-95"
            >
              <Check size={13} />
              {language === 'bn' ? 'সংরক্ষণ ও পাঠান' : 'Save & Submit'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} group/wrapper`}
    >
      <div className={`flex gap-3 w-full ${msg.sender === 'user' ? 'justify-end max-w-[85%]' : 'max-w-full items-start'}`}>
        {/* Message Content */}
        <div className={`flex flex-col gap-1.5 min-w-0 group relative ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`relative px-5 py-4 border ${
              msg.sender === 'user'
                ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 text-white border-transparent rounded-[24px] rounded-tr-[6px] shadow-[0_8px_24px_rgba(99,102,241,0.25)]'
                : 'bg-[var(--glass-bg)] backdrop-blur-md text-[var(--text)] border-[var(--glass-border)] rounded-[24px] rounded-tl-[6px] shadow-sm'
            }`}
          >
            {/* Images Grid */}
            {(() => {
              const imagesToRender = (msg as any).images && (msg as any).images.length > 0 
                ? (msg as any).images 
                : (msg.image ? [msg.image] : []);

              if (imagesToRender.length === 0) return null;

              return (
                <div className={`mb-3 grid gap-2 ${
                  imagesToRender.length === 1 ? 'grid-cols-1 max-w-sm' : 
                  imagesToRender.length === 2 ? 'grid-cols-2 max-w-md' : 
                  'grid-cols-2 sm:grid-cols-3 max-w-lg'
                }`}>
                  {imagesToRender.map((imgUrl: string, idx: number) => (
                    <div key={idx} className="rounded-[14px] overflow-hidden border border-white/20 shadow-md relative group/img transition-all aspect-square bg-black/20">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none z-10 opacity-0 group-hover/img:opacity-100 transition-opacity" />
                      <img 
                        src={imgUrl} 
                        alt={`Uploaded photo ${idx + 1}`} 
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" 
                        onLoad={scrollToBottom}
                        onClick={() => window.open(imgUrl, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              );
            })()}
            {msg.sender === 'user' ? (
              <p className="leading-relaxed whitespace-pre-wrap break-words text-[15px] font-medium">{msg.text}</p>
            ) : (
              <div className="markdown-body leading-relaxed max-w-none text-[var(--text)] break-words text-[15px]">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a({ node, children, href, ...props }: any) {
                      return (
                        <a 
                          {...props} 
                          href={href}
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary underline font-semibold hover:opacity-80 transition-opacity break-all inline-flex items-center gap-1"
                        >
                          {children}
                        </a>
                      );
                    },
                    img(props) {
                      return <img {...props} className="max-w-full h-auto rounded-xl my-4 shadow-md border border-[var(--border)]" loading="lazy" />;
                    },
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      const isDark = document.documentElement.className.includes('dark')
                      return !inline && match ? (
                        <div className="my-3 overflow-hidden rounded-xl shadow-md border border-[var(--border)]">
                          <SyntaxHighlighter
                            {...props}
                            children={String(children).replace(/\n$/, '')}
                            style={isDark ? vscDarkPlus : vs as any}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, padding: '0.85rem', fontSize: '0.825rem' }}
                          />
                        </div>
                      ) : (
                        <code {...props} className={`${className} bg-[var(--text)]/10 text-primary font-mono font-bold px-1.5 py-0.5 rounded-md`}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {msg.text}
                </ReactMarkdown>

                {/* Inline Dynamic File Artifact Card */}
                {artifactProject && onOpenPreview && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    <FileArtifactCard 
                      project={artifactProject} 
                      onOpenPreview={onOpenPreview} 
                    />
                  </motion.div>
                )}

                {/* Google Search Grounding Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-3.5 pt-3 border-t border-[var(--glass-border)] w-full"
                  >
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-[var(--text-muted)]">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                      </svg>
                      <span>{language === 'bn' ? 'গুগল সার্চ সূত্র (Google Search Grounding)' : 'Google Search Grounding Sources'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((src, i) => {
                        let domain = "";
                        try {
                          domain = new URL(src.uri).hostname.replace(/^www\./, "");
                        } catch {
                          domain = "Web Source";
                        }
                        return (
                          <a
                            key={i}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--card)] hover:bg-[var(--hover)] border border-[var(--border)] text-[var(--text)] hover:text-primary transition-all max-w-[240px] shadow-xs group/src"
                            title={src.title || src.uri}
                          >
                            <Globe size={12} className="text-primary flex-shrink-0" />
                            <span className="truncate font-medium">{src.title || domain}</span>
                            <ExternalLink size={10} className="text-[var(--text-muted)] group-hover/src:text-primary flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
          
          <div className={`flex items-center gap-2 mt-1 opacity-0 group-hover/wrapper:opacity-100 transition-opacity duration-300 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <span className="text-[10px] text-[var(--text-muted)] font-medium px-1">
              {formattedTime}
            </span>
            
            <div className={`flex items-center gap-1 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
               {/* User edit button */}
               {msg.sender === 'user' && (
                 <button
                   type="button"
                   onClick={() => {
                     setEditText(msg.text);
                     setIsEditing(true);
                   }}
                   className="p-1.5 rounded-[6px] transition-colors text-[var(--text-muted)] hover:text-white hover:bg-white/20"
                   title={language === 'bn' ? 'মেসেজ সম্পাদনা করুন' : 'Edit message'}
                 >
                   <Edit2 size={12} />
                 </button>
               )}

               {/* AI Retry button */}
               {msg.sender === 'ai' && (
                 <button
                   type="button"
                   onClick={() => onRetryAiMessage?.(msg.id)}
                   className="p-1.5 rounded-[6px] transition-colors text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] flex items-center gap-1"
                   title={language === 'bn' ? 'পুনরায় উত্তর দিন' : 'Retry AI response'}
                 >
                   <RotateCcw size={12} />
                 </button>
               )}

               {/* TTS button for all messages */}
               <button
                 type="button"
                 onClick={() => toggleSpeech(msg.text, msg.id)}
                 className={`p-1.5 rounded-[6px] transition-colors ${isCurrentlySpeaking ? 'text-primary bg-primary/10' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'}`}
                 title={isCurrentlySpeaking ? "Stop reading" : "Read aloud"}
               >
                 {isCurrentlySpeaking ? <Square size={12} className="fill-current" /> : <Volume2 size={12} />}
               </button>

              {/* Copy button */}
              <button
                type="button"
                onClick={() => handleCopy(msg.text, msg.id)}
                className="p-1.5 rounded-[6px] transition-colors text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                title="Copy to clipboard"
              >
                {copiedId === msg.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>

              {msg.sender === 'ai' && (
                <button
                  type="button"
                  onClick={() => exportAsMarkdown(`nexara_response_${msg.id.substring(0, 6)}`, msg.text)}
                  className="p-1.5 rounded-[6px] transition-colors text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                  title="Export message as Markdown"
                >
                  <Download size={12} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
}, (prev, next) => {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg.text === next.msg.text &&
    prev.isCurrentlySpeaking === next.isCurrentlySpeaking &&
    (prev.copiedId === prev.msg.id) === (next.copiedId === next.msg.id) &&
    prev.language === next.language
  );
});

interface MessageListProps {
  filteredMessages: Message[];
  searchQuery: string;
  isSpeaking: string | null;
  copiedId: string | null;
  scrollToBottom: () => void;
  toggleSpeech: (text: string, id: string) => void;
  handleCopy: (text: string, id: string) => void;
  onOpenPreview?: (project: ArtifactProject, fileId?: string) => void;
  onEditUserMessage?: (msgId: string, newText: string) => void;
  onRetryAiMessage?: (aiMsgId: string) => void;
  language?: string;
}

const MessageList = React.memo(({
  filteredMessages,
  searchQuery,
  isSpeaking,
  copiedId,
  scrollToBottom,
  toggleSpeech,
  handleCopy,
  onOpenPreview,
  onEditUserMessage,
  onRetryAiMessage,
  language
}: MessageListProps) => {
  if (filteredMessages.length === 0 && searchQuery) {
    return (
      <div className="text-center text-[var(--text-muted)] py-10 font-medium bg-[var(--card)]/50 rounded-2xl border border-[var(--border)] mt-8">
        {language === 'bn' ? 'কোনো মেসেজ পাওয়া যায়নি' : 'No messages found'}
      </div>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {filteredMessages.map((msg) => (
        <MessageItem 
          key={msg.id} 
          msg={msg} 
          isCurrentlySpeaking={isSpeaking === msg.id} 
          copiedId={copiedId} 
          scrollToBottom={scrollToBottom} 
          toggleSpeech={toggleSpeech} 
          handleCopy={handleCopy} 
          onOpenPreview={onOpenPreview}
          onEditUserMessage={onEditUserMessage}
          onRetryAiMessage={onRetryAiMessage}
          language={language}
        />
      ))}
    </AnimatePresence>
  );
});

export default function ChatScreen({ initialPrompt, clearInitialPrompt, currentChatId, setCurrentChatId, setCurrentScreen, isFocusMode = false, onToggleFocusMode }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimVoiceText, setInterimVoiceText] = useState<string | undefined>(undefined);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedImageNames, setSelectedImageNames] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [currentAiActivity, setCurrentAiActivity] = useState<'thinking' | 'searching' | 'writing_code' | 'analyzing_image' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusTool, setStatusTool] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [streamingSources, setStreamingSources] = useState<GroundingSource[]>([]);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMemory, setUserMemory] = useState<string>('');
  const [inactiveDays, setInactiveDays] = useState<number>(0);
  const [voiceCommands, setVoiceCommands] = useState<string[]>([]);
  const [showVoiceCommands, setShowVoiceCommands] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('Nexara AI');
  const [drawerState, setDrawerState] = useState<DrawerState>({
    isOpen: false,
    project: null,
    activeFileId: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      finishBackgroundGeneration();
    }
  }, []);

  const handleOpenPreview = useCallback((project: ArtifactProject, fileId?: string) => {
    setDrawerState({
      isOpen: true,
      project,
      activeFileId: fileId || project.files[0]?.id || null
    });
  }, []);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const baseInputRef = useRef<string>('');

  useEffect(() => {
    // Focus the input when chat screen is opened
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Keyboard Shortcuts (Cmd/Ctrl + K, Cmd/Ctrl + /, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K => Open new chat
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCurrentChatId(null);
        setMessages([]);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
        return;
      }

      // Cmd/Ctrl + / => Focus Search Bar or Prompt Input
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        if (searchInputRef.current && document.activeElement !== searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        } else if (inputRef.current) {
          inputRef.current.focus();
        }
        return;
      }

      // Cmd/Ctrl + Shift + F => Toggle Focus Mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (onToggleFocusMode) onToggleFocusMode();
        return;
      }

      // Esc => Close active drawers, modals, or exit Focus Mode
      if (e.key === 'Escape') {
        if (drawerState.isOpen) {
          setDrawerState({ isOpen: false, project: null, activeFileId: null });
        } else if (showSummaryModal) {
          setShowSummaryModal(false);
        } else if (showVoiceCommands) {
          setShowVoiceCommands(false);
        } else if (isFocusMode && onToggleFocusMode) {
          onToggleFocusMode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerState.isOpen, showSummaryModal, showVoiceCommands, setCurrentChatId]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const userId = auth.currentUser?.uid;
  const { language, t } = useLanguage();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const isAiWorking = Boolean(isTyping && (!streamingText || streamingText.trim().length === 0));

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    if (isNearBottom) {
      setUserHasScrolled(false);
      setShowScrollBottomBtn(false);
    } else {
      setUserHasScrolled(true);
      setShowScrollBottomBtn(true);
    }
  }, []);

  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (userHasScrolled && !force) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    });
  }, [userHasScrolled]);

  useEffect(() => {
    if (!userHasScrolled) {
      scrollToBottom();
    }
  }, [messages.length, isTyping, streamingText, scrollToBottom, userHasScrolled]);

  useEffect(() => {
    if (userId) {
      const fetchUserDataAndCalculateInactivity = async () => {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserMemory(data.memory || '');
            
            if (data.lastActive) {
              const lastActiveDate = data.lastActive.toDate ? data.lastActive.toDate() : new Date(data.lastActive);
              const now = new Date();
              const diffTime = Math.abs(now.getTime() - lastActiveDate.getTime());
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              setInactiveDays(diffDays);
            } else {
              setInactiveDays(0);
            }
          }
          
          // Update lastActive timestamp
          await setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true });
        } catch (error) {
          console.error("Error fetching user data/memory:", error);
        }
      };
      fetchUserDataAndCalculateInactivity();
    }
  }, [userId]);

  useEffect(() => {
    // Pre-load voices for browser TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const latestPropsRef = useRef({
    setCurrentScreen,
    setCurrentChatId,
    handleSend: (text?: string, systemPromptOverride?: string, temperature?: number) => {},
    isSpeaking
  });

  useEffect(() => {
    latestPropsRef.current = {
      setCurrentScreen,
      setCurrentChatId,
      handleSend,
      isSpeaking
    };
  });

  // Initialize Speech Recognition (Web Speech API)
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      return;
    }
    
    setIsSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = true;
    
    const langMap: Record<string, string> = {
      en: 'en-US', bn: 'bn-BD', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR'
    };
    
    // Support English and Bengali dynamically based on app language or browser settings
    const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
    const activeLang = langMap[language] || (browserLang.startsWith('bn') ? 'bn-BD' : 'en-US');
    recognition.lang = activeLang;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        const transcriptText = finalTranscript.trim();
        
        setVoiceCommands(prev => {
          const newHistory = [transcriptText, ...prev.filter(t => t.toLowerCase() !== transcriptText.toLowerCase())].slice(0, 10);
          return newHistory;
        });

        const lowerTranscript = transcriptText.toLowerCase();
        
        // Voice Commands
        if (lowerTranscript === 'send message' || lowerTranscript === 'send' || lowerTranscript === 'মেসেজ পাঠান' || lowerTranscript === 'পাঠান') {
          latestPropsRef.current.handleSend(baseInputRef.current);
          return;
        } else if (lowerTranscript === 'start new chat' || lowerTranscript === 'new chat' || lowerTranscript === 'নতুন চ্যাট' || lowerTranscript === 'নতুন চ্যাট শুরু করুন') {
          latestPropsRef.current.setCurrentChatId(null);
          setInterimVoiceText('');
          baseInputRef.current = '';
          return;
        } else if (lowerTranscript === 'go to settings' || lowerTranscript === 'open settings' || lowerTranscript === 'সেটিংসে যান' || lowerTranscript === 'সেটিংস খুলুন') {
          latestPropsRef.current.setCurrentScreen('settings');
          return;
        } else if (lowerTranscript === 'go to dashboard' || lowerTranscript === 'open dashboard' || lowerTranscript === 'ড্যাশবোর্ডে যান' || lowerTranscript === 'ড্যাশবোর্ড খুলুন') {
          latestPropsRef.current.setCurrentScreen('dashboard');
          return;
        } else if (lowerTranscript === 'stop reading' || lowerTranscript === 'stop playback' || lowerTranscript === 'পড়া বন্ধ করুন' || lowerTranscript === 'থামুন') {
          window.speechSynthesis.cancel();
          if (currentSourceRef.current) {
            currentSourceRef.current.stop();
            currentSourceRef.current.disconnect();
            currentSourceRef.current = null;
          }
          setIsSpeaking(null);
          return;
        }

        baseInputRef.current = (baseInputRef.current + ' ' + finalTranscript).trim();
        setInterimVoiceText(baseInputRef.current);
      } else if (interimTranscript) {
        setInterimVoiceText((baseInputRef.current + ' ' + interimTranscript).trim());
      }

      // Auto-resize textarea live as user speaks
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert(language === 'bn' ? "মাইক্রোফোন অ্যাক্সেস বন্ধ রয়েছে। ব্রাউজার সেটিংসে গিয়ে মাইক্রোফোন পারমিশন এলাউ করুন।" : "Microphone access was denied. Please allow microphone permissions in your browser settings.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore abort errors
        }
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch (e) {}
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
      window.speechSynthesis.cancel();
    };
  }, [language]);

  const toggleListening = () => {
    if (!isSpeechSupported) {
      alert(language === 'bn' ? "আপনার ব্রাউজারে স্পিচ রিকগনিশন সমর্থিত নয়। অনুগ্রহ করে গুগল ক্রোম ব্যবহার করুন।" : "Speech recognition is not supported in this browser. Please try using Google Chrome or another modern browser.");
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          setIsListening(true);
          baseInputRef.current = inputRef.current?.value || '';
          recognitionRef.current.start();
        } catch (e) {
          console.warn("Could not start speech recognition:", e);
          try {
            recognitionRef.current.stop();
            setTimeout(() => {
              try { 
                recognitionRef.current.start(); 
              } catch(err) { 
                setIsListening(false); 
              }
            }, 100);
          } catch(err) {
            setIsListening(false);
          }
        }
      }
    }
  };

  const playPcmAudio = async (base64Audio: string, messageId: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Stop current
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      }

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // The audio is 16-bit PCM, 24000 Hz, mono.
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      source.onended = () => {
        setIsSpeaking(null);
        currentSourceRef.current = null;
      };

      currentSourceRef.current = source;
      setIsSpeaking(messageId);
      source.start(0);
      
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsSpeaking(null);
    }
  };

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const toggleSpeech = useCallback(async (text: string, messageId: string) => {
    if (isSpeaking === messageId) {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
        currentSourceRef.current = null;
      }
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }

    setIsSpeaking(messageId); // Loading state

    try {
      // Fetch active API key
      let activeApiKey = '';
      try {
        const apikeysRef = doc(db, 'settings', 'apikeys');
        const apikeysSnap = await getDoc(apikeysRef);
        if (apikeysSnap.exists()) {
          const keys = apikeysSnap.data().keys || [];
          if (keys.length > 0) activeApiKey = keys[0];
        }
      } catch (e) {
        console.warn("Could not read API keys from Firestore", e);
      }

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey: activeApiKey, language })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch TTS: ' + response.statusText);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received non-JSON response from API");
      }
      const data = await response.json();
      if (data.audio) {
        await playPcmAudio(data.audio, messageId);
      } else {
        throw new Error('No audio returned');
      }
    } catch (error) {
      // Silently fall back to browser TTS
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const langMap: Record<string, string> = {
          en: 'en-US', bn: 'bn-BD', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR'
        };
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langMap[language] || 'en-US';
        
        // Try to find a clear male voice
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const langVoices = voices.filter(v => v.lang.startsWith(utterance.lang.split('-')[0]));
          const maleVoice = langVoices.find(v => 
            v.name.toLowerCase().includes('male') || 
            v.name.toLowerCase().includes('guy') ||
            v.name.toLowerCase().includes('david') ||
            v.name.toLowerCase().includes('mark')
          );
          if (maleVoice) {
            utterance.voice = maleVoice;
          } else if (langVoices.length > 0) {
            utterance.voice = langVoices[0];
          }
        }
        
        utterance.rate = 0.95; // Slightly slower for clarity
        utterance.pitch = 0.9; // Slightly lower pitch for a more masculine tone
        
        utterance.onstart = () => setIsSpeaking(messageId);
        utterance.onend = () => setIsSpeaking(null);
        utterance.onerror = () => setIsSpeaking(null);

        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(null);
        alert("Text-to-speech is not supported in your browser.");
      }
    }
  }, [isSpeaking, language]);

  useEffect(() => {
    if (!userId) return;
    if (!currentChatId) {
      setMessages([]);
      return;
    }
    
    const path = `users/${userId}/chats/${currentChatId}/messages`;
    const q = query(collection(db, path), orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          text: data.text,
          sender: data.sender,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          image: data.image,
          images: data.images,
          sources: data.sources,
          searchQueries: data.searchQueries
        });
      });
      setMessages(msgs);
    }, (error) => {
      console.error("Firestore LIST error (rules may not be configured):", error);
    });

    return () => unsubscribe();
  }, [userId, currentChatId]);

  const handleSummarizeChat = async () => {
    if (messages.length === 0 || !userId) return;
    setIsSummarizing(true);
    try {
      const conversation = messages.map(m => `${m.sender === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
      const prompt = `Please provide a concise and comprehensive summary of the following conversation:\n\n${conversation}`;

      // Fetch active API key
      let activeApiKey = '';
      try {
        const apikeysRef = doc(db, 'settings', 'apikeys');
        const apikeysSnap = await getDoc(apikeysRef);
        if (apikeysSnap.exists()) {
          const keys = apikeysSnap.data().keys || [];
          if (keys.length > 0) activeApiKey = keys[0];
        }
      } catch (e) {
        console.warn("Could not read API keys from Firestore", e);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          language,
          apiKey: activeApiKey,
          memory: '', // No memory needed for summary
          stream: false // Non-streaming mode for direct JSON reply
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(parseFrontendError(errorData) || `Failed to fetch summary (Status: ${response.status})`);
        } else {
          const textError = await response.text().catch(() => "");
          console.error("Non-JSON Error Response:", textError);
          throw new Error(`Failed to fetch summary (Status: ${response.status}). The server returned an invalid response.`);
        }
      }

      const contentType = response.headers.get("content-type");
      let summaryResult = "";

      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        summaryResult = data.reply || "";
      } else if (contentType && contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.chunk) summaryResult += data.chunk;
              if (data.reply) summaryResult = data.reply;
            } catch (e) {}
          }
        }
      } else {
        const textResponse = await response.text().catch(() => "");
        if (textResponse.includes("data: ")) {
          const lines = textResponse.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.reply) summaryResult = parsed.reply;
                else if (parsed.chunk) summaryResult += parsed.chunk;
              } catch (e) {}
            }
          }
        } else {
          summaryResult = textResponse;
        }
      }

      if (!summaryResult.trim()) {
        throw new Error("No summary text was generated.");
      }

      setSummaryText(summaryResult);
      setShowSummaryModal(true);
    } catch (error: any) {
      console.error("Error summarizing chat:", error);
      const errMsg = parseFrontendError(error);
      alert(errMsg || (language === 'bn' ? "সারসংক্ষেপ তৈরি করতে সমস্যা হয়েছে।" : "Failed to summarize chat. Please try again."));
    } finally {
      setIsSummarizing(false);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setSelectedImageNames(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    setSelectedImages([]);
    setSelectedImageNames([]);
  };

  const processImageFiles = (files: File[] | FileList) => {
    const filesArray = Array.isArray(files) ? files : Array.from(files);
    const validFiles = filesArray.filter(file => file.type.match(/image\/(jpeg|jpg|png|webp|gif)/));
    if (validFiles.length === 0) {
      alert(language === 'bn' ? 'সাপোর্টেড ফরম্যাট: JPG, PNG, WEBP, GIF ছবি যোগ করুন।' : 'Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.');
      return;
    }

    const currentCount = selectedImages.length;
    const remainingSlots = 5 - currentCount;

    if (remainingSlots <= 0) {
      alert(language === 'bn' ? 'একবারে সর্বোচ্চ ৫টি ছবি যুক্ত করা সম্ভব।' : 'Maximum 5 images allowed at a time.');
      return;
    }

    if (validFiles.length > remainingSlots) {
      alert(language === 'bn' ? `সর্বোচ্চ ৫টি ছবির সীমা। প্রথম ${remainingSlots}টি ছবি যুক্ত করা হচ্ছে।` : `Limit is 5 images. Adding the first ${remainingSlots} image(s).`);
    }

    const filesToProcess = validFiles.slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(language === 'bn' ? `${file.name} এর সাইজ ১০ এমবি এর বেশি।` : `${file.name} is too large (>10MB).`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            
            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            setSelectedImages(prev => {
              if (prev.length >= 5) return prev;
              return [...prev, compressedDataUrl];
            });
            setSelectedImageNames(prev => [...prev, file.name || 'image.jpg']);
          };
          img.src = event.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processImageFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processImageFiles(imageFiles);
      } else {
        alert(language === 'bn' ? 'সাপোর্টেড ফরম্যাট: JPG, PNG, WEBP, GIF ছবি ড্রপ করুন।' : 'Please drop supported image files (JPG, PNG, WEBP, GIF).');
      }
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedImageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            pastedImageFiles.push(file);
          }
        }
      }

      if (pastedImageFiles.length > 0) {
        e.preventDefault();
        processImageFiles(pastedImageFiles);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [language, selectedImages.length]);

  const handleSend = async (textOverride?: string, systemPromptOverride?: string, temperature?: number) => {
    const text = textOverride !== undefined ? textOverride : (inputRef.current?.value || '');
    if (!text.trim() && selectedImages.length === 0) return;
    if (!userId) return;

    let usedVoice = false;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      usedVoice = true;
    }

    const currentImages = [...selectedImages];
    setInterimVoiceText(undefined);
    if (inputRef.current) {
        inputRef.current.style.height = 'auto';
    }
    const hasUploadedImages = currentImages.length > 0;
    clearAllImages();
    baseInputRef.current = '';
    setIsTyping(true);
    setCurrentAiActivity(hasUploadedImages ? 'analyzing_image' : 'thinking');
    const initialStatusText = language === 'bn' ? 'নেক্সারা এআই ভাবছে...' : 'Nexara AI is thinking...';
    setStatusMessage(initialStatusText);
    setStatusTool('thinking');
    setStreamingText('');

    // Trigger notification permission & background tab processing
    requestNotificationPermission();
    startBackgroundGeneration(initialStatusText);

    // Initialize AbortController for stop-generation feature
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    let chatId = currentChatId;
    const isNewChat = !chatId;
    const isFirstExchange = messages.length === 0;

    try {
      if (!chatId) {
        // Create new chat with fallback title
        const fallbackTitle = text ? (text.length > 30 ? text.substring(0, 30) + '...' : text) : (language === 'bn' ? 'নতুন চ্যাট' : 'New Chat');
        const chatRef = await addDoc(collection(db, `users/${userId}/chats`), {
          title: fallbackTitle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        chatId = chatRef.id;
        setCurrentChatId(chatId);
      } else {
        // Update existing chat updatedAt
        await updateDoc(doc(db, `users/${userId}/chats`, chatId), {
          updatedAt: serverTimestamp()
        });
      }

      const path = `users/${userId}/chats/${chatId}/messages`;
      
      // Save user message
      const userMessageData: any = {
        text: text,
        sender: 'user',
        timestamp: serverTimestamp()
      };
      if (currentImages.length > 0) {
        userMessageData.images = currentImages;
        userMessageData.image = currentImages[0];
      }
      await addDoc(collection(db, path), userMessageData);

      // Prepare messages for AI
      const groqMessages = messages.map(m => {
        const mImages = (m as any).images && (m as any).images.length > 0 
          ? (m as any).images 
          : (m.image ? [m.image] : []);

        if (mImages.length > 0 && m.sender === 'user') {
          const contentArray: any[] = [{ type: 'text', text: m.text || ' ' }];
          mImages.forEach((img: string) => {
            contentArray.push({ type: 'image_url', image_url: { url: img } });
          });
          return {
            role: 'user',
            content: contentArray
          };
        }
        return {
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        };
      });
      
      if (currentImages.length > 0) {
        const contentArray: any[] = [{ type: 'text', text: text || ' ' }];
        currentImages.forEach((img: string) => {
          contentArray.push({ type: 'image_url', image_url: { url: img } });
        });
        groqMessages.push({
          role: 'user',
          content: contentArray
        });
      } else {
        groqMessages.push({ role: 'user', content: text });
      }

      // Fetch active API key from Firestore
      let activeApiKey = '';
      try {
        const apikeysRef = doc(db, 'settings', 'apikeys');
        const apikeysSnap = await getDoc(apikeysRef);
        if (apikeysSnap.exists()) {
          const keys = apikeysSnap.data().keys || [];
          if (keys.length > 0) {
            activeApiKey = keys[0];
          }
        }
      } catch (keyError) {
        console.warn("Could not read API keys from Firestore, falling back to environment variable.", keyError);
      }

      // Fetch from AI backend with streaming support
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        },
        signal: abortControllerRef.current?.signal,
        body: JSON.stringify({ 
          messages: groqMessages, 
          language, 
          apiKey: activeApiKey, 
          memory: userMemory,
          userInfo: {
            email: auth.currentUser?.email || '',
            displayName: auth.currentUser?.displayName || '',
            photoURL: auth.currentUser?.photoURL || '',
            inactiveDays: inactiveDays
          },
          focusMode: isFocusMode,
          systemPromptOverride,
          temperature,
          webSearch: isWebSearchActive,
          model: selectedModel,
          stream: true
        })
      });

      if (!response.ok) {
        if (response.status === 413) {
           const sizeErrMsg = language === 'bn' ? "ছবির সাইজ অনেক বড়। দয়া করে ছোট সাইজের ছবি আপলোড করুন।" : "The image is too large. Please upload a smaller image.";
           throw new Error(sizeErrMsg);
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          const cleanMsg = parseFrontendError(errorData) || `Failed to fetch AI response (Status: ${response.status})`;
          throw new Error(cleanMsg);
        } else {
          const textError = await response.text().catch(() => "");
          console.error("Non-JSON Error Response:", textError);
          throw new Error(`Failed to fetch AI response (Status: ${response.status}). The server returned an invalid response.`);
        }
      }
      
      const contentType = response.headers.get("content-type");
      let replyText = "";
      let generatedImage = null;
      let currentSources: GroundingSource[] = [];
      let currentQueries: string[] = [];

      if (contentType && contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.error) {
                throw new Error(parseFrontendError(data.error));
              }
              if (data.status) {
                setStatusMessage(data.status);
                updateBackgroundStatus(data.status);
                if (data.tool) {
                  setStatusTool(data.tool);
                }
                const statusLower = (data.status || '').toLowerCase();
                const toolLower = (data.tool || '').toLowerCase();
                if (toolLower.includes('search') || statusLower.includes('search') || statusLower.includes('খোঁজা') || statusLower.includes('অনুসন্ধান')) {
                  setCurrentAiActivity('searching');
                } else if (toolLower.includes('code') || statusLower.includes('code') || statusLower.includes('কোড')) {
                  setCurrentAiActivity('writing_code');
                } else if (toolLower.includes('vision') || toolLower.includes('image') || statusLower.includes('image') || statusLower.includes('ছবি')) {
                  setCurrentAiActivity('analyzing_image');
                }
              }
              if (data.sources && Array.isArray(data.sources)) {
                currentSources = data.sources;
                setStreamingSources(data.sources);
              }
              if (data.searchQueries && Array.isArray(data.searchQueries)) {
                currentQueries = data.searchQueries;
              }
              if (data.chunk) {
                replyText += data.chunk;
                setStreamingText(replyText);
                
                // Real-time dynamic action state fallback
                const codeMatches = replyText.match(/```/g);
                const isCodeOpen = codeMatches ? codeMatches.length % 2 === 1 : false;

                if (isCodeOpen || (replyText.includes('```') && (data.tool === 'code_gen' || replyText.includes('filename=')))) {
                  setCurrentAiActivity('writing_code');
                  const codeStatus = language === 'bn' ? 'কোড তৈরি করা হচ্ছে...' : 'Writing code...';
                  setStatusMessage(codeStatus);
                  setStatusTool('code_gen');
                  updateBackgroundStatus(codeStatus);
                } else if (data.tool?.includes('search')) {
                  setCurrentAiActivity('searching');
                } else if (replyText.trim().length > 0) {
                  setCurrentAiActivity(null);
                  const writingStatus = language === 'bn' ? 'উত্তর লেখা হচ্ছে...' : 'Writing response...';
                  setStatusMessage(writingStatus);
                  setStatusTool('writing');
                  updateBackgroundStatus(writingStatus);
                }
              }
              if (data.reply) {
                replyText = data.reply;
                setStreamingText(replyText);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes("Unexpected token")) {
                throw e;
              }
            }
          }
        }
      } else if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        replyText = data.reply || "Sorry, I couldn't generate a response.";
        generatedImage = data.image || null;
        if (data.sources && Array.isArray(data.sources)) {
          currentSources = data.sources;
        }
        if (data.searchQueries && Array.isArray(data.searchQueries)) {
          currentQueries = data.searchQueries;
        }
      } else {
        const textResponse = await response.text().catch(() => "");
        console.error("Non-JSON Success Response:", textResponse);
        throw new Error("Received non-JSON response from API");
      }

      if (!replyText.trim()) {
        replyText = "Sorry, I couldn't generate a response.";
      }

      // Save normal AI response
      const aiResponseData: any = {
        text: replyText,
        sender: 'ai',
        timestamp: serverTimestamp()
      };
      
      if (generatedImage) {
        aiResponseData.image = generatedImage;
      }
      if (currentSources.length > 0) {
        aiResponseData.sources = currentSources;
      }
      if (currentQueries.length > 0) {
        aiResponseData.searchQueries = currentQueries;
      }

      const aiDocRef = await addDoc(collection(db, path), aiResponseData);

      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      abortControllerRef.current = null;
      finishBackgroundGeneration(replyText);

      if (usedVoice) {
        toggleSpeech(replyText, aiDocRef.id);
      }
      
      scrollToBottom();

      // Auto-summarize conversation main topic into a concise title for chat history
      if (isNewChat || isFirstExchange || messages.length <= 1) {
        const targetChatId = chatId;
        fetch('/api/summarize-title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userText: text,
            aiReply: replyText,
            language,
            apiKey: activeApiKey
          })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.title && d.title.trim() && targetChatId && userId) {
              updateDoc(doc(db, `users/${userId}/chats`, targetChatId), {
                title: d.title.trim()
              }).catch((e) => console.warn('Failed updating chat title summary:', e));
            }
          })
          .catch((err) => console.warn('Error summarizing chat title:', err));
      }

      } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("AI generation stopped by user.");
        return;
      }
      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      abortControllerRef.current = null;
      finishBackgroundGeneration();
      
      const cleanErrorMsg = parseFrontendError(error);
      
      // Check if it's an API error (not a firestore permissions error)
      if (!cleanErrorMsg.includes("permission-denied") && !cleanErrorMsg.includes("Missing or insufficient permissions")) {
        // Create an AI error bubble to display the issue
        if (chatId && userId) {
          try {
            await addDoc(collection(db, `users/${userId}/chats/${chatId}/messages`), {
              text: `⚠️ **Error:** ${cleanErrorMsg}`,
              sender: 'ai',
              timestamp: serverTimestamp()
            });
            scrollToBottom();
          } catch(e) {
            console.error("Failed to write error message to chat", e);
          }
        }
        return;
      }
      
      console.error("Firestore message write error (rules may not be configured):", error);
    }
  };

  const handleRetryAiMessage = async (aiMsgId: string) => {
    if (!currentChatId || !userId || isTyping) return;

    const aiIndex = messages.findIndex(m => m.id === aiMsgId);
    if (aiIndex === -1) return;

    setIsTyping(true);
    setCurrentAiActivity('thinking');
    const initialStatusText = language === 'bn' ? 'নেক্সারা এআই পুনরায় চিন্তা করছে...' : 'Nexara AI is regenerating...';
    setStatusMessage(initialStatusText);
    setStatusTool('thinking');
    setStreamingText('');

    try {
      const historySlice = messages.slice(0, aiIndex);
      const groqMessages = historySlice.map(m => {
        const mImages = (m as any).images && (m as any).images.length > 0 
          ? (m as any).images 
          : (m.image ? [m.image] : []);

        if (mImages.length > 0 && m.sender === 'user') {
          const contentArray: any[] = [{ type: 'text', text: m.text || ' ' }];
          mImages.forEach((img: string) => {
            contentArray.push({ type: 'image_url', image_url: { url: img } });
          });
          return { role: 'user', content: contentArray };
        }
        return {
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        };
      });

      let activeApiKey = '';
      try {
        const apikeysRef = doc(db, 'settings', 'apikeys');
        const apikeysSnap = await getDoc(apikeysRef);
        if (apikeysSnap.exists()) {
          const keys = apikeysSnap.data().keys || [];
          if (keys.length > 0) activeApiKey = keys[0];
        }
      } catch (e) {}

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        },
        body: JSON.stringify({ 
          messages: groqMessages, 
          language, 
          apiKey: activeApiKey, 
          memory: userMemory,
          userInfo: {
            email: auth.currentUser?.email || '',
            displayName: auth.currentUser?.displayName || '',
            photoURL: auth.currentUser?.photoURL || '',
            inactiveDays: inactiveDays
          },
          webSearch: isWebSearchActive,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch AI response (Status: ${response.status})`);
      }

      const contentType = response.headers.get("content-type");
      let replyText = "";
      let currentSources: GroundingSource[] = [];
      let currentQueries: string[] = [];

      if (contentType && contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.status) {
                setStatusMessage(data.status);
                if (data.tool) setStatusTool(data.tool);
                const statusLower = (data.status || '').toLowerCase();
                const toolLower = (data.tool || '').toLowerCase();
                if (toolLower.includes('search') || statusLower.includes('search') || statusLower.includes('খোঁজা') || statusLower.includes('অনুসন্ধান')) {
                  setCurrentAiActivity('searching');
                } else if (toolLower.includes('code') || statusLower.includes('code') || statusLower.includes('কোড')) {
                  setCurrentAiActivity('writing_code');
                } else if (toolLower.includes('vision') || toolLower.includes('image') || statusLower.includes('image') || statusLower.includes('ছবি')) {
                  setCurrentAiActivity('analyzing_image');
                }
              }
              if (data.sources && Array.isArray(data.sources)) {
                currentSources = data.sources;
                setStreamingSources(data.sources);
              }
              if (data.searchQueries && Array.isArray(data.searchQueries)) {
                currentQueries = data.searchQueries;
              }
              if (data.chunk) {
                replyText += data.chunk;
                setStreamingText(replyText);

                const codeMatches = replyText.match(/```/g);
                const isCodeOpen = codeMatches ? codeMatches.length % 2 === 1 : false;
                if (isCodeOpen || (replyText.includes('```') && data.tool === 'code_gen')) {
                  setCurrentAiActivity('writing_code');
                } else if (data.tool?.includes('search')) {
                  setCurrentAiActivity('searching');
                } else if (replyText.trim().length > 0) {
                  setCurrentAiActivity(null);
                }
              }
              if (data.reply) {
                replyText = data.reply;
                setStreamingText(replyText);
              }
            } catch (e) {}
          }
        }
      } else if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        replyText = data.reply || "Sorry, I couldn't generate a response.";
        if (data.sources && Array.isArray(data.sources)) currentSources = data.sources;
        if (data.searchQueries && Array.isArray(data.searchQueries)) currentQueries = data.searchQueries;
      }

      if (!replyText.trim()) {
        replyText = "Sorry, I couldn't generate a response.";
      }

      const msgDocRef = doc(db, `users/${userId}/chats/${currentChatId}/messages`, aiMsgId);
      const updatePayload: any = {
        text: replyText,
        timestamp: serverTimestamp()
      };
      if (currentSources.length > 0) updatePayload.sources = currentSources;
      if (currentQueries.length > 0) updatePayload.searchQueries = currentQueries;

      await updateDoc(msgDocRef, updatePayload);

      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      scrollToBottom();
    } catch (error: any) {
      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      console.error("Error retrying AI response:", error);
    }
  };

  const handleEditUserMessage = async (userMsgId: string, newText: string) => {
    if (!currentChatId || !userId || isTyping) return;

    const userIndex = messages.findIndex(m => m.id === userMsgId);
    if (userIndex === -1) return;

    try {
      const userDocRef = doc(db, `users/${userId}/chats/${currentChatId}/messages`, userMsgId);
      await updateDoc(userDocRef, {
        text: newText,
        timestamp: serverTimestamp()
      });

      const updatedMessages = [...messages];
      updatedMessages[userIndex] = { ...updatedMessages[userIndex], text: newText };
      const historySlice = updatedMessages.slice(0, userIndex + 1);

      setIsTyping(true);
      setCurrentAiActivity('thinking');
      const initialStatusText = language === 'bn' ? 'নেক্সারা এআই চিন্তা করছে...' : 'Nexara AI is thinking...';
      setStatusMessage(initialStatusText);
      setStatusTool('thinking');
      setStreamingText('');

      const groqMessages = historySlice.map(m => {
        const mImages = (m as any).images && (m as any).images.length > 0 
          ? (m as any).images 
          : (m.image ? [m.image] : []);

        if (mImages.length > 0 && m.sender === 'user') {
          const contentArray: any[] = [{ type: 'text', text: m.text || ' ' }];
          mImages.forEach((img: string) => {
            contentArray.push({ type: 'image_url', image_url: { url: img } });
          });
          return { role: 'user', content: contentArray };
        }
        return {
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        };
      });

      let activeApiKey = '';
      try {
        const apikeysRef = doc(db, 'settings', 'apikeys');
        const apikeysSnap = await getDoc(apikeysRef);
        if (apikeysSnap.exists()) {
          const keys = apikeysSnap.data().keys || [];
          if (keys.length > 0) activeApiKey = keys[0];
        }
      } catch (e) {}

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        },
        body: JSON.stringify({ 
          messages: groqMessages, 
          language, 
          apiKey: activeApiKey, 
          memory: userMemory,
          userInfo: {
            email: auth.currentUser?.email || '',
            displayName: auth.currentUser?.displayName || '',
            photoURL: auth.currentUser?.photoURL || '',
            inactiveDays: inactiveDays
          },
          webSearch: isWebSearchActive,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch AI response (Status: ${response.status})`);
      }

      const contentType = response.headers.get("content-type");
      let replyText = "";
      let currentSources: GroundingSource[] = [];
      let currentQueries: string[] = [];

      if (contentType && contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.status) {
                setStatusMessage(data.status);
                if (data.tool) setStatusTool(data.tool);
                const statusLower = (data.status || '').toLowerCase();
                const toolLower = (data.tool || '').toLowerCase();
                if (toolLower.includes('search') || statusLower.includes('search') || statusLower.includes('খোঁজা') || statusLower.includes('অনুসন্ধান')) {
                  setCurrentAiActivity('searching');
                } else if (toolLower.includes('code') || statusLower.includes('code') || statusLower.includes('কোড')) {
                  setCurrentAiActivity('writing_code');
                } else if (toolLower.includes('vision') || toolLower.includes('image') || statusLower.includes('image') || statusLower.includes('ছবি')) {
                  setCurrentAiActivity('analyzing_image');
                }
              }
              if (data.sources && Array.isArray(data.sources)) {
                currentSources = data.sources;
                setStreamingSources(data.sources);
              }
              if (data.searchQueries && Array.isArray(data.searchQueries)) {
                currentQueries = data.searchQueries;
              }
              if (data.chunk) {
                replyText += data.chunk;
                setStreamingText(replyText);

                const codeMatches = replyText.match(/```/g);
                const isCodeOpen = codeMatches ? codeMatches.length % 2 === 1 : false;
                if (isCodeOpen || (replyText.includes('```') && data.tool === 'code_gen')) {
                  setCurrentAiActivity('writing_code');
                } else if (data.tool?.includes('search')) {
                  setCurrentAiActivity('searching');
                } else if (replyText.trim().length > 0) {
                  setCurrentAiActivity(null);
                }
              }
              if (data.reply) {
                replyText = data.reply;
                setStreamingText(replyText);
              }
            } catch (e) {}
          }
        }
      } else if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        replyText = data.reply || "Sorry, I couldn't generate a response.";
        if (data.sources && Array.isArray(data.sources)) currentSources = data.sources;
        if (data.searchQueries && Array.isArray(data.searchQueries)) currentQueries = data.searchQueries;
      }

      if (!replyText.trim()) {
        replyText = "Sorry, I couldn't generate a response.";
      }

      const path = `users/${userId}/chats/${currentChatId}/messages`;
      const nextMsg = messages[userIndex + 1];
      const aiDataPayload: any = {
        text: replyText,
        timestamp: serverTimestamp()
      };
      if (currentSources.length > 0) aiDataPayload.sources = currentSources;
      if (currentQueries.length > 0) aiDataPayload.searchQueries = currentQueries;

      if (nextMsg && nextMsg.sender === 'ai') {
        await updateDoc(doc(db, path, nextMsg.id), aiDataPayload);
      } else {
        await addDoc(collection(db, path), {
          ...aiDataPayload,
          sender: 'ai'
        });
      }

      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      scrollToBottom();
    } catch (error: any) {
      setIsTyping(false);
      setCurrentAiActivity(null);
      setStatusMessage('');
      setStatusTool('');
      setStreamingText('');
      setStreamingSources([]);
      console.error("Error editing user message:", error);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(msg => msg.text.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-dvh bg-transparent relative overflow-hidden"
    >
      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 m-3 rounded-3xl border-2 border-dashed border-primary shadow-2xl pointer-events-none"
          >
            <div className="w-20 h-20 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mb-4 animate-bounce shadow-lg shadow-primary/20">
              <ImageIcon size={40} />
            </div>
            <h3 className="text-xl font-bold text-white text-center">
              {language === 'bn' ? 'ছবিটি এখানে ছেড়ে দিন (Drop)' : 'Drop photo here to attach'}
            </h3>
            <p className="text-xs text-primary-200 text-center mt-1 font-medium">
              {language === 'bn' ? 'স্বয়ংক্রিয়ভাবে চ্যাটে ফটো যুক্ত হয়ে যাবে' : 'Your image will be attached to the message automatically'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 pt-3 pb-2 md:px-8 md:pt-4">
        {messages.length === 0 && !isTyping ? (
          <div className="flex flex-col min-h-full justify-end text-center pb-2 pt-4">
            <div className="mt-auto mb-2 flex flex-col items-center justify-center w-full max-w-5xl mx-auto">
            <motion.h1 
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-3xl sm:text-5xl font-display font-bold mb-2 tracking-tight flex items-center justify-center gap-3 sm:gap-4"
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
                {language === 'bn' ? 'আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?' : 'How can I help you today?'}
              </span>
            </motion.h1>
            <motion.p
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-sm sm:text-base text-[var(--text-muted)] font-medium max-w-lg mb-5 sm:mb-6"
            >
              {language === 'bn' ? 'আজ আপনার মনে কী চলছে? চলুন শুরু করা যাক।' : "What's on your mind today? Let's dive in."}
            </motion.p>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl px-2 sm:px-4"
            >
              {[
                { 
                  icon: <Sparkles size={20}/>, 
                  en: "Generate a creative story", 
                  bn: "একটি সৃজনশীল গল্প তৈরি করুন",
                  descEn: "Unleash imagination with unique plots",
                  descBn: "অদ্বিতীয় কাহিনী দিয়ে কল্পনাকে জাগিয়ে তুলুন",
                  color: "from-purple-500/20 to-indigo-500/20",
                  iconColor: "text-purple-500",
                  sysPrompt: "Generate a unique, unpredictable, and highly creative short story. Randomly choose a genre (e.g., Sci-Fi, Mystery, Cyberpunk, Fantasy, or Time Travel) and invent compelling characters. Ensure it is not generic.",
                  temp: 0.85
                },
                { 
                  icon: <FileText size={20}/>, 
                  en: "Summarize a long article", 
                  bn: "একটি দীর্ঘ নিবন্ধ সারসংক্ষেপ করুন",
                  descEn: "Get key points in seconds",
                  descBn: "সেকেন্ডের মধ্যে মূল পয়েন্টগুলো জানুন",
                  color: "from-blue-500/20 to-cyan-500/20",
                  iconColor: "text-blue-500",
                  sysPrompt: "The user wants to summarize a long article. Please provide a clear, concise article summary framework or analyze an interesting topic, and invite the user to share their own article or text for you to summarize.",
                  temp: 0.7
                },
                { 
                  icon: <Search size={20}/>, 
                  en: "Find recent news about AI", 
                  bn: "এআই সম্পর্কে সাম্প্রতিক সংবাদ খুঁজুন",
                  descEn: "Stay updated with latest trends",
                  descBn: "সর্বশেষ ট্রেন্ড সম্পর্কে আপডেটেড থাকুন",
                  color: "from-emerald-500/20 to-teal-500/20",
                  iconColor: "text-emerald-500",
                  sysPrompt: "Act as an AI news reporter. Share 3 to 5 key recent developments, breakthroughs, or insights in Artificial Intelligence. Format this in a clean, bulleted news summary format.",
                  temp: 0.75
                },
                { 
                  icon: <ImageIcon size={20}/>, 
                  en: "Write code to fetch an image", 
                  bn: "একটি চিত্র আনার জন্য কোড লিখুন",
                  descEn: "Modern API integration examples",
                  descBn: "আধুনিক এপিআই ইন্টিগ্রেশন উদাহরণ",
                  color: "from-amber-500/20 to-orange-500/20",
                  iconColor: "text-amber-500",
                  sysPrompt: "Generate modern, clean, production-ready code (using JavaScript, Python, or React) to fetch and display a random image. You may use Unsplash, Pexels, or the standard Fetch API. Explain how the code works.",
                  temp: 0.7
                }
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    handleSend(language === 'bn' ? prompt.bn : prompt.en, prompt.sysPrompt, prompt.temp);
                  }}
                  className="group relative flex items-start gap-4 p-4 bg-[var(--glass-bg)] hover:bg-[var(--hover)] border border-[var(--border)] rounded-2xl text-left transition-all hover:scale-[1.02] hover:shadow-xl overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${prompt.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  
                  <div className={`relative p-2.5 bg-[var(--card)] border border-[var(--border)] ${prompt.iconColor} rounded-xl shrink-0 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                    {prompt.icon}
                  </div>
                  
                  <div className="relative flex flex-col gap-0.5">
                    <span className="text-[14px] sm:text-[15px] font-bold text-[var(--text)] group-hover:text-primary transition-colors line-clamp-1">
                      {language === 'bn' ? prompt.bn : prompt.en}
                    </span>
                    <span className="text-[11px] sm:text-[12px] text-[var(--text-muted)] font-medium leading-tight">
                      {language === 'bn' ? prompt.descBn : prompt.descEn}
                    </span>
                  </div>
                </button>
              ))}
            </motion.div>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto w-full space-y-6 pb-4">
            {!isFocusMode && filteredMessages.length > 2 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4">
                <div className="relative w-full sm:w-auto flex-1 max-w-md">
                  <div className="absolute inset-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search size={16} className="text-[var(--text-muted)]" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'bn' ? 'মেসেজ খুঁজুন...' : 'Search messages...'}
                    className="w-full pl-11 pr-12 py-2 bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] rounded-[14px] text-sm font-medium text-[var(--text)] focus:outline-none focus:ring-4 focus:ring-primary/10 hover:border-[var(--text-muted)]/30 transition-all shadow-inner"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--card)] border border-[var(--glass-border)] rounded-md shadow-sm">
                      ⌘/
                    </kbd>
                  </div>
                </div>
                <button
                  onClick={handleSummarizeChat}
                  disabled={isSummarizing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-[14px] text-sm font-semibold text-[var(--text)] hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 disabled:opacity-50 whitespace-nowrap w-full sm:w-auto active:scale-[0.97]"
                >
                  {isSummarizing ? (
                    <Sparkles size={16} className="animate-pulse" />
                  ) : (
                    <FileText size={16} className="opacity-70 group-hover:opacity-100" />
                  )}
                  {isSummarizing ? (language === 'bn' ? 'সারসংক্ষেপ তৈরি হচ্ছে...' : 'Summarizing...') : (language === 'bn' ? 'চ্যাটের সারসংক্ষেপ' : 'Summarize Chat')}
                </button>
              </div>
            )}
            
            <MessageList 
              filteredMessages={filteredMessages}
              searchQuery={searchQuery}
              isSpeaking={isSpeaking}
              copiedId={copiedId}
              scrollToBottom={scrollToBottom}
              toggleSpeech={toggleSpeech}
              handleCopy={handleCopy}
              onOpenPreview={handleOpenPreview}
              onEditUserMessage={handleEditUserMessage}
              onRetryAiMessage={handleRetryAiMessage}
              language={language}
            />

            {/* Typing & Dynamic Status Indicator */}
            <AnimatePresence>
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-start pt-2 w-full"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex-1 max-w-[85%] sm:max-w-[88%] bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] rounded-[24px] rounded-tl-[6px] px-5 py-4 shadow-sm flex flex-col relative mt-1 text-[var(--text)]">
                      {streamingText ? (
                    <div className="markdown-body text-sm leading-relaxed mb-1">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p({ node, children, ...props }: any) {
                            const isPlainText = typeof children === 'string';
                            if (isPlainText) {
                              const isLastParagraph = isTyping && streamingText.trimEnd().endsWith(children.trimEnd());
                              return (
                                <p className="mb-2.5 last:mb-0 leading-relaxed" {...props}>
                                  <SmoothWritingText text={children} isStreaming={isLastParagraph} />
                                </p>
                              );
                            }
                            return <p className="mb-2.5 last:mb-0 leading-relaxed" {...props}>{children}</p>;
                          },
                          a({ node, children, href, ...props }: any) {
                            return (
                              <a 
                                {...props} 
                                href={href} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary underline font-semibold hover:opacity-80 transition-opacity break-all inline-flex items-center gap-1"
                              >
                                {children}
                              </a>
                            );
                          },
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isDark = document.documentElement.className.includes('dark');
                            return !inline && match ? (
                              <div className="my-3 overflow-hidden rounded-xl shadow-md border border-[var(--border)]">
                                <SyntaxHighlighter
                                  style={isDark ? vscDarkPlus : (vs as any)}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ margin: 0, padding: '0.85rem', fontSize: '0.825rem' }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className="bg-indigo-500/10 text-primary font-mono font-semibold px-1.5 py-0.5 rounded text-xs" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {streamingText}
                      </ReactMarkdown>
                    </div>
                  ) : null}

                  {/* AI Working / Thinking Waveform Indicator */}
                  {(isAiWorking || (isTyping && statusMessage)) && (
                    <div className="py-2" role="status">
                      <WaveformIndicator label={statusMessage || (language === 'bn' ? 'নেক্সারা এআই চিন্তা করছে...' : 'Thinking...')} />
                    </div>
                  )}

                  {/* Streaming Search Grounding Sources */}
                  {streamingSources && streamingSources.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 pt-2.5 border-t border-[var(--glass-border)] w-full"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-[var(--text-muted)]">
                        <Globe size={13} className="text-primary animate-pulse flex-shrink-0" />
                        <span>{language === 'bn' ? 'গুগল সার্চ সূত্র (Google Search Grounding)' : 'Google Search Sources'}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {streamingSources.map((src, i) => {
                          let domain = "";
                          try {
                            domain = new URL(src.uri).hostname.replace(/^www\./, "");
                          } catch {
                            domain = "Web Source";
                          }
                          return (
                            <a
                              key={i}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--card)] hover:bg-[var(--hover)] border border-[var(--border)] text-[var(--text)] hover:text-primary transition-all max-w-[200px] truncate group/src"
                              title={src.title || src.uri}
                            >
                              <span className="truncate">{src.title || domain}</span>
                              <ExternalLink size={9} className="text-[var(--text-muted)] group-hover/src:text-primary flex-shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimal scroll target */}
        <div ref={messagesEndRef} className="h-4 shrink-0 w-full" />
      </div>
    )}

    {/* Floating Scroll to Bottom Button */}
    <AnimatePresence>
      {showScrollBottomBtn && (
        <motion.button
          initial={{ opacity: 0, y: 15, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          onClick={() => {
            setUserHasScrolled(false);
            setShowScrollBottomBtn(false);
            scrollToBottom(true);
          }}
          className="fixed bottom-28 right-6 sm:right-10 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-[0_8px_20px_rgba(99,102,241,0.35)] border border-white/20 backdrop-blur-md active:scale-95 transition-all cursor-pointer"
        >
          <ArrowDown size={14} className="animate-bounce" />
          <span>{language === 'bn' ? 'নিচে যান' : 'Scroll to bottom'}</span>
        </motion.button>
      )}
    </AnimatePresence>
  </div>

      {/* Input Area */}
      <ChatInputBar
        onSend={handleSend}
        isTyping={isTyping}
        onStopGeneration={handleStopGeneration}
        language={language}
        currentChatId={currentChatId}
        initialPrompt={initialPrompt}
        clearInitialPrompt={clearInitialPrompt}
        selectedImages={selectedImages}
        selectedImageNames={selectedImageNames}
        onAddImages={processImageFiles}
        onRemoveImage={removeImage}
        onClearImages={clearAllImages}
        isWebSearchActive={isWebSearchActive}
        setIsWebSearchActive={setIsWebSearchActive}
        inputRef={inputRef}
        isSpeechSupported={isSpeechSupported}
        isListening={isListening}
        toggleListening={toggleListening}
        cancelListening={() => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          setIsListening(false);
          setInterimVoiceText(undefined);
          baseInputRef.current = "";
        }}
        voiceCommands={voiceCommands}
        voiceTranscript={interimVoiceText}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      {/* Summary Modal */}
      <AnimatePresence>
        {showSummaryModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[var(--glass-bg)] backdrop-blur-2xl border border-[var(--glass-border)] rounded-[2rem] p-6 max-w-lg w-full shadow-2xl max-h-[80vh] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 blur-[50px] rounded-full pointer-events-none -mr-20 -mt-20" />
              
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-primary/20">
                        <FileText size={20} />
                    </div>
                <h3 className="text-xl font-display font-semibold text-[var(--text)]">
                  {language === 'bn' ? 'চ্যাটের সারসংক্ষেপ' : 'Chat Summary'}
                </h3>
                </div>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="p-2 text-[var(--text-muted)] hover:text-primary hover:bg-[var(--hover)] rounded-full transition-all active:scale-95"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
              
              <div className="overflow-y-auto pr-2 custom-scrollbar text-[var(--text)] text-[15px] leading-relaxed whitespace-pre-wrap relative z-10 font-medium opacity-90 p-4 bg-[var(--card)]/50 rounded-2xl border border-[var(--border)]">
                {summaryText}
              </div>
              
              <div className="mt-6 flex justify-end relative z-10">
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-[0.98] text-sm"
                >
                  {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claude Artifacts / ChatGPT Canvas Style Code Preview Drawer */}
      <CodePreviewDrawer 
        isOpen={drawerState.isOpen}
        project={drawerState.project}
        initialFileId={drawerState.activeFileId}
        onClose={() => setDrawerState({ isOpen: false, project: null, activeFileId: null })}
      />
    </div>
  );
}
