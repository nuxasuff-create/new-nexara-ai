import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Mic, Square, X, History, Plus, Globe, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ChatInputBarProps {
  onSend: (text: string) => void;
  isTyping: boolean;
  language: string;
  currentChatId: string | null;
  initialPrompt?: string;
  clearInitialPrompt?: () => void;
  selectedImages: string[];
  selectedImageNames: string[];
  onAddImages: (files: FileList | File[]) => void;
  onRemoveImage: (index: number) => void;
  onClearImages: () => void;
  isWebSearchActive: boolean;
  setIsWebSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isSpeechSupported: boolean;
  isListening: boolean;
  toggleListening: () => void;
  cancelListening: () => void;
  voiceCommands: string[];
  voiceTranscript?: string;
}

function ChatInputBarComponent({
  onSend,
  isTyping,
  language,
  currentChatId,
  initialPrompt,
  clearInitialPrompt,
  selectedImages,
  selectedImageNames,
  onAddImages,
  onRemoveImage,
  onClearImages,
  isWebSearchActive,
  setIsWebSearchActive,
  inputRef,
  isSpeechSupported,
  isListening,
  toggleListening,
  cancelListening,
  voiceCommands,
  voiceTranscript
}: ChatInputBarProps) {
  const [text, setText] = useState(initialPrompt || '');
  const [showVoiceCommands, setShowVoiceCommands] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialPrompt when passed from dashboard/history
  useEffect(() => {
    if (initialPrompt) {
      setText(initialPrompt);
      clearInitialPrompt?.();
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      }
    }
  }, [initialPrompt, clearInitialPrompt, inputRef]);

  // Clear text when new chat is started
  useEffect(() => {
    if (!currentChatId && !initialPrompt) {
      setText('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  }, [currentChatId, initialPrompt, inputRef]);

  // Sync voice transcript when speech recognition streams words
  useEffect(() => {
    if (voiceTranscript !== undefined && isListening) {
      setText(voiceTranscript);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      }
    }
  }, [voiceTranscript, isListening, inputRef]);

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && selectedImages.length === 0) || isTyping) return;
    onSend(trimmed);
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isSendDisabled = (!text.trim() && selectedImages.length === 0) || isTyping;

  return (
    <div className="px-4 pt-2 pb-4 md:px-8 md:pt-3 md:pb-6 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/95 to-transparent relative z-20">
      <div className="max-w-3xl mx-auto relative">
        {/* Selected Images Preview Container */}
        {selectedImages.length > 0 && (
          <div className="mb-2 p-2.5 bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                <ImageIcon size={14} className="text-primary" />
                {selectedImages.length}/5 {language === 'bn' ? 'ছবি যুক্ত' : 'Attached'}
              </span>
              <div className="flex items-center gap-2">
                {selectedImages.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> {language === 'bn' ? 'আরও যোগ করুন' : 'Add more'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClearImages}
                  className="text-[11px] font-medium text-red-500 hover:text-red-600 hover:underline ml-2"
                >
                  {language === 'bn' ? 'সব মুছুন' : 'Clear all'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {selectedImages.map((imgSrc, idx) => (
                <div key={idx} className="relative group shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[var(--border)] shadow-sm bg-black/5">
                  <img src={imgSrc} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 text-white rounded-full transition-colors opacity-90 group-hover:opacity-100"
                    title={language === 'bn' ? 'ছবি সরান' : 'Remove photo'}
                  >
                    <X size={10} />
                  </button>
                  {selectedImageNames[idx] && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white px-1 py-0.5 truncate text-center">
                      {selectedImageNames[idx]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-2 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] rounded-[24px] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:border-[var(--text-muted)]/40 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 transition-all duration-300">
          {/* File Attachment Input (hidden) */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />

          {/* Plus / Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={selectedImages.length >= 5}
            className={`p-2 transition-all rounded-full z-10 relative flex items-center justify-center shrink-0 ${
              selectedImages.length >= 5
                ? 'text-[var(--text-muted)]/40 cursor-not-allowed opacity-50'
                : 'text-[var(--text-muted)] hover:text-primary hover:bg-primary/10'
            }`}
            title={selectedImages.length >= 5 ? 'Maximum 5 images allowed' : 'Attach photo/image (max 5)'}
          >
            <Plus size={20} strokeWidth={2} />
          </button>

          {/* Voice Input Button */}
          <div className="relative flex items-center shrink-0">
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute -top-11 left-1/2 -translate-x-1/2 bg-red-500/10 dark:bg-red-950/50 border border-red-500/30 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 shadow-lg z-30 pointer-events-none"
                >
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-2 bg-red-500 rounded-full animate-bounce" />
                  </div>
                  <span className="text-[11px] font-semibold text-red-500 whitespace-nowrap">
                    {language === 'bn' ? 'শুনছি...' : 'Listening...'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={toggleListening}
              disabled={!isSpeechSupported}
              className={`p-2 transition-all rounded-full z-10 relative flex items-center justify-center ${
                !isSpeechSupported
                  ? 'text-[var(--text-muted)]/40 cursor-not-allowed opacity-50'
                  : isListening
                  ? 'text-red-500 bg-red-500/10 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'
              }`}
              title={
                !isSpeechSupported
                  ? (language === 'bn' ? 'এই ব্রাউজারে স্পিচ রিকগনিশন সমর্থিত নয়' : 'Speech recognition not supported in this browser')
                  : isListening
                  ? (language === 'bn' ? 'শুনছি... (থামাতে আবার ক্লিক করুন)' : 'Listening... (click to stop)')
                  : (language === 'bn' ? 'ভয়েস ইনপুট শুরু করুন' : 'Start voice input')
              }
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
              )}
              {isListening ? (
                <Square size={18} className="fill-current text-red-500" />
              ) : (
                <Mic size={20} strokeWidth={1.5} />
              )}
            </button>

            {/* Voice Command History Popover */}
            <AnimatePresence>
              {showVoiceCommands && voiceCommands.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full mb-4 md:-left-8 left-0 w-64 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)]">
                    <h4 className="text-sm font-medium text-[var(--text)] flex items-center gap-1.5"><History size={14} /> Voice History</h4>
                    <button onClick={() => setShowVoiceCommands(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {voiceCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setText(cmd);
                          setShowVoiceCommands(false);
                          if (inputRef.current) {
                            inputRef.current.focus();
                          }
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--hover)] border-b border-[var(--border)] last:border-0 transition-colors truncate"
                      >
                        "{cmd}"
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {voiceCommands.length > 0 && (
              <button
                type="button"
                onClick={() => setShowVoiceCommands(!showVoiceCommands)}
                className="absolute -top-3 -right-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] rounded-full p-0.5 shadow-sm z-20 transition-transform hover:scale-110"
                title="Recent Voice Commands"
              >
                <History size={12} />
              </button>
            )}
          </div>

          {/* Google Search Grounding Toggle Button */}
          <button
            type="button"
            onClick={() => setIsWebSearchActive(prev => !prev)}
            className={`p-2 transition-all rounded-full z-10 relative flex items-center justify-center shrink-0 ${
              isWebSearchActive
                ? 'text-blue-500 bg-blue-500/15 ring-2 ring-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'
            }`}
            title={
              language === 'bn'
                ? (isWebSearchActive ? 'গুগল সার্চ গ্রাউন্ডিং সক্রিয় (ক্লিক করে বন্ধ করুন)' : 'গুগল সার্চ গ্রাউন্ডিং চালু করুন (লাইভ গুগল সার্চ ও তথ্যসূত্র)')
                : (isWebSearchActive ? 'Google Search Grounding Active (Click to disable)' : 'Enable Google Search Grounding (Live Google Search data & sources)')
            }
          >
            <Globe size={20} strokeWidth={isWebSearchActive ? 2 : 1.5} className={isWebSearchActive ? 'text-blue-500 animate-pulse' : ''} />
            {isWebSearchActive && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full ring-2 ring-[var(--card)]" />
            )}
          </button>

          {/* The Isolated Textarea */}
          <div className="relative flex-1 flex flex-col justify-center min-w-0">
            <textarea
              ref={inputRef}
              value={text}
              maxLength={4000}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? (language === 'bn' ? 'শুনছি...' : 'Listening...')
                  : (language === 'bn' ? 'মেসেজ লিখুন, বা ওয়েব এ কিছু খুঁজুন...' : 'Ask anything, or search the web...')
              }
              className="w-full bg-transparent border-none text-[var(--text)] py-3.5 pl-3 pr-14 focus:outline-none focus:ring-0 placeholder-[var(--text-muted)] text-[15px] font-medium resize-none overflow-y-auto leading-relaxed transition-all duration-200"
              style={{ maxHeight: '200px' }}
            />

            <div className="absolute right-0 bottom-3 flex items-center pr-3 pointer-events-none">
              <span className={`text-[10px] font-medium pointer-events-auto mr-1 ${text.length >= 4000 ? 'text-red-500' : 'text-[var(--text-muted)]/50'}`}>
                {text.length}/4000
              </span>
              {text.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setText('');
                    if (inputRef.current) {
                      inputRef.current.style.height = 'auto';
                      inputRef.current.focus();
                    }
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors p-1 pointer-events-auto rounded-full hover:bg-[var(--hover)]"
                  title="Clear input"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {isListening && (
            <button
              type="button"
              onClick={cancelListening}
              className="p-2 text-[var(--text-muted)] hover:text-red-500 transition-colors z-10"
              title="Cancel voice input"
            >
              <X size={20} />
            </button>
          )}

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSendDisabled}
            className={`p-2.5 mr-1.5 rounded-[12px] flex items-center justify-center transition-all z-10 ${
              isSendDisabled
                ? 'bg-[var(--hover)] text-[var(--text-muted)]'
                : 'bg-primary text-white hover:shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95'
            }`}
          >
            <Send size={18} className={isSendDisabled ? '' : 'translate-x-[1px] translate-y-[-1px]'} strokeWidth={2.5} />
          </button>
        </div>

        {/* Helper footer */}
        <div className="flex justify-center mt-2 opacity-50 hover:opacity-100 transition-opacity pb-2">
          <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase font-bold mix-blend-difference">
            {language === 'bn' ? 'নেক্সারা এআই ভুল করতে পারে। গুরুত্বপূর্ণ তথ্য যাচাই করুন।' : 'Nexara AI can make mistakes. Verify important info.'}
          </span>
        </div>
      </div>
    </div>
  );
}

export const ChatInputBar = React.memo(ChatInputBarComponent);
export default ChatInputBar;
