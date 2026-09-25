import React, { useState, useEffect, useRef } from 'react';
import { ArrowUp, Plus, X, Image as ImageIcon, Mic, Square } from 'lucide-react';
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
  onStopGeneration?: () => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
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
  inputRef,
  voiceTranscript,
  isListening,
  isSpeechSupported,
  toggleListening,
  onStopGeneration
}: ChatInputBarProps) {
  const [text, setText] = useState(initialPrompt || '');
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

  const isSendDisabled = (!text.trim() && selectedImages.length === 0);

  return (
    <div className="px-4 pb-8 md:px-8 md:pb-12 pb-safe bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/90 to-transparent relative z-20">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        {/* Selected Images Preview Container */}
        {selectedImages.length > 0 && (
          <div className="w-full mb-3 p-2.5 bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                <ImageIcon size={14} className="text-primary" />
                {selectedImages.length}/5 {language === 'bn' ? 'ছবি যুক্ত' : 'Attached'}
              </span>
              <button
                type="button"
                onClick={onClearImages}
                className="text-[11px] font-medium text-red-500 hover:text-red-600 hover:underline"
              >
                {language === 'bn' ? 'সব মুছুন' : 'Clear all'}
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {selectedImages.map((imgSrc, idx) => (
                <div key={idx} className="relative group shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[var(--border)] shadow-sm bg-black/5">
                  <img src={imgSrc} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 text-white rounded-full transition-colors"
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

        <div className="w-full relative flex items-center bg-[var(--card)]/90 backdrop-blur-2xl border border-[var(--border)] rounded-[28px] p-1.5 shadow-xl focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 transition-all duration-300 mb-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={selectedImages.length >= 5}
            className={`p-3 ml-1 rounded-full flex items-center justify-center transition-all ${
              selectedImages.length >= 5
                ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                : 'text-[var(--text-muted)] hover:text-primary hover:bg-primary/10'
            }`}
            title="Attach images"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>

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
            placeholder={isListening ? (language === 'bn' ? 'শুনছি...' : 'Listening...') : 'Ask Anything'}
            className={`flex-1 bg-transparent border-none text-[var(--text)] py-3 px-2 focus:outline-none focus:ring-0 placeholder-[var(--text-muted)] text-[16px] resize-none overflow-y-auto leading-relaxed transition-opacity ${isListening ? 'opacity-80' : 'opacity-100'}`}
            style={{ maxHeight: '200px' }}
          />

          {isSpeechSupported ? (
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'text-white bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse scale-110'
                  : 'text-[var(--text-muted)] hover:text-primary hover:bg-primary/10'
              }`}
              title={isListening ? "Stop listening" : "Voice input"}
            >
              <Mic size={20} strokeWidth={isListening ? 3 : 2.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => alert(language === 'bn' ? "আপনার ব্রাউজারে স্পিচ রিকগনিশন সমর্থিত নয়। অনুগ্রহ করে গুগল ক্রোম ব্যবহার করুন।" : "Speech recognition is not supported in this browser. Please try using Google Chrome.")}
              className="p-3 rounded-full flex items-center justify-center text-[var(--text-muted)] opacity-40 cursor-not-allowed"
              title="Voice input not supported"
            >
              <Mic size={20} strokeWidth={2.5} />
            </button>
          )}

          <motion.button
            type="button"
            onClick={isTyping ? onStopGeneration : handleSend}
            disabled={!isTyping && isSendDisabled}
            initial={false}
            animate={{
              scale: isTyping || !isSendDisabled ? 1 : 0.9,
              background: isTyping 
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                : !isSendDisabled 
                  ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' 
                  : 'rgba(0, 0, 0, 0.05)',
              boxShadow: !isSendDisabled || isTyping
                ? isTyping 
                  ? '0 0 20px rgba(239, 68, 68, 0.3)' 
                  : '0 10px 25px -5px rgba(99, 102, 241, 0.4), 0 8px 10px -6px rgba(99, 102, 241, 0.4)'
                : 'none'
            }}
            whileHover={!isSendDisabled || isTyping ? { 
              scale: 1.05,
              filter: 'brightness(1.1)',
            } : {}}
            whileTap={{ scale: 0.95 }}
            className="relative p-3 mr-1 rounded-2xl flex items-center justify-center transition-all overflow-hidden group"
            title={isTyping ? (language === 'bn' ? 'থামান' : 'Stop generating') : (language === 'bn' ? 'মেসেজ পাঠান' : 'Send message')}
          >
            {/* Animated background glow for active state */}
            {!isSendDisabled && !isTyping && (
              <motion.div
                layoutId="glow"
                className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                animate={{
                  background: [
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 70%)',
                    'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.4) 0%, transparent 70%)',
                    'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4) 0%, transparent 70%)',
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 70%)',
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            )}

            <AnimatePresence mode="wait">
              {isTyping ? (
                <motion.div
                  key="stop"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                >
                  <Square size={18} fill="white" stroke="white" />
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                  className={!isSendDisabled ? 'text-white' : 'text-[var(--text-muted)]'}
                >
                  <ArrowUp size={22} strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Disclaimer text below the input box */}
        <p className="text-[12px] text-[var(--text-muted)] font-medium text-center px-4 leading-tight">
          Nexara AI can make mistakes. Check important info at{' '}
          <a 
            href="https://ainexara.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline transition-all"
          >
            ainexara.com
          </a>
        </p>
      </div>
    </div>
  );
}

export const ChatInputBar = React.memo(ChatInputBarComponent);
export default ChatInputBar;
