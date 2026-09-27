import { Menu, User, BookOpen, Minimize2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { useLanguage } from '../context/LanguageContext';

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
  isSidebarOpen: boolean;
  user: FirebaseUser;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  activeSearchData?: { sources: any[], searchImages: any[] } | null;
  activeTab?: 'answer' | 'links' | 'images';
  setActiveTab?: (tab: 'answer' | 'links' | 'images') => void;
}

export default function TopBar({ 
  title, 
  onMenuClick, 
  isSidebarOpen, 
  user, 
  isFocusMode = false, 
  onToggleFocusMode,
  activeSearchData,
  activeTab = 'answer',
  setActiveTab
}: TopBarProps) {
  const { language } = useLanguage();

  const showTabs = !!activeSearchData && (
    (Array.isArray(activeSearchData.sources) && activeSearchData.sources.length > 0) ||
    (Array.isArray(activeSearchData.searchImages) && activeSearchData.searchImages.length > 0)
  );

  return (
    <header className={`h-16 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30 transition-all duration-300 relative ${
      isFocusMode 
        ? 'bg-[var(--glass-bg)]/80 backdrop-blur-xl border-b border-primary/20 shadow-lg shadow-primary/5' 
        : 'bg-[var(--glass-bg)] backdrop-blur-md border-b border-[var(--glass-border)]'
    }`}>
      {/* Left: Navigation and Branding */}
      <div className="flex items-center gap-2 sm:gap-3 relative z-10 flex-shrink-0">
        {!isFocusMode && (!isSidebarOpen || window.innerWidth < 768) && (
          <button
            onClick={onMenuClick}
            className="p-2 -ml-1 sm:-ml-2 text-[var(--text)] hover:bg-[var(--hover)] hover:text-primary hover:shadow-sm rounded-[12px] transition-all duration-300 active:scale-95 flex-shrink-0"
            title="Open Sidebar"
          >
            <Menu size={22} strokeWidth={2.5} />
          </button>
        )}
        
        <div className="flex items-center gap-2.5 font-display font-semibold text-[18px] sm:text-[20px] tracking-tight">
          <img src="/logo.png" alt="Nexara AI" className="h-8 w-8 object-contain drop-shadow-md flex-shrink-0" />
          {(!showTabs || window.innerWidth >= 1024) && (
            <span className="truncate bg-clip-text text-transparent bg-gradient-to-br from-[var(--text)] to-[var(--text-muted)] transition-all duration-300">
              {isFocusMode ? (language === 'bn' ? 'ফোকাস মোড' : 'Focus Mode') : title}
            </span>
          )}
        </div>
      </div>

      {/* Center: Conditional Answer / Links / Images Tab Bar */}
      {showTabs && (
        <div className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-full p-1 shadow-sm transition-all duration-300 animate-in fade-in zoom-in-95 max-w-[85vw] sm:max-w-none">
          <button
            onClick={() => setActiveTab?.('answer')}
            className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'answer'
                ? 'bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] text-white shadow-md shadow-[#7C5CFC]/25 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'
            }`}
          >
            <Sparkles size={13} className={activeTab === 'answer' ? 'text-white' : 'text-[#7C5CFC]'} />
            <span>{language === 'bn' ? 'উত্তর' : 'Answer'}</span>
          </button>

          <button
            onClick={() => setActiveTab?.('links')}
            className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'links'
                ? 'bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] text-white shadow-md shadow-[#7C5CFC]/25 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'
            }`}
          >
            <BookOpen size={13} className={activeTab === 'links' ? 'text-white' : 'text-[#7C5CFC]'} />
            <span>{language === 'bn' ? 'লিঙ্ক' : 'Links'}</span>
            {activeSearchData.sources && activeSearchData.sources.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === 'links' ? 'bg-white/25 text-white' : 'bg-[var(--hover)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}>
                {activeSearchData.sources.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab?.('images')}
            className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'images'
                ? 'bg-gradient-to-r from-[#7C5CFC] to-[#E345A8] text-white shadow-md shadow-[#7C5CFC]/25 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]'
            }`}
          >
            <ImageIcon size={13} className={activeTab === 'images' ? 'text-white' : 'text-[#E345A8]'} />
            <span>{language === 'bn' ? 'ছবি' : 'Images'}</span>
            {activeSearchData.searchImages && activeSearchData.searchImages.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === 'images' ? 'bg-white/25 text-white' : 'bg-[var(--hover)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}>
                {activeSearchData.searchImages.length}
              </span>
            )}
          </button>
        </div>
      )}
      
      {/* Right: Actions and User Profile */}
      <div className="flex items-center gap-2 sm:gap-3 relative z-10 flex-shrink-0">
        {onToggleFocusMode && (
          <button
            onClick={onToggleFocusMode}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-300 active:scale-95 shadow-sm ${
              isFocusMode
                ? 'bg-primary text-white border-primary hover:bg-primary/90 shadow-primary/20'
                : 'bg-[var(--glass-bg)] text-[var(--text-muted)] hover:text-[var(--text)] border-[var(--glass-border)] hover:bg-[var(--hover)] hover:border-primary/30'
            }`}
            title={isFocusMode ? (language === 'bn' ? 'ফোকাস মোড বন্ধ করুন (Esc)' : 'Exit Focus Mode (Esc)') : (language === 'bn' ? 'ফোকাস / রিডিং মোড' : 'Focus / Reading Mode')}
          >
            {isFocusMode ? (
              <>
                <Minimize2 size={16} strokeWidth={2.5} />
                <span className="hidden sm:inline">{language === 'bn' ? 'ফোকাস ত্যাগ করুন' : 'Exit Focus'}</span>
              </>
            ) : (
              <>
                <BookOpen size={16} strokeWidth={2.5} />
                <span className="hidden sm:inline">{language === 'bn' ? 'ফোকাস মোড' : 'Focus Mode'}</span>
              </>
            )}
          </button>
        )}

        <button className="relative w-10 h-10 rounded-full overflow-hidden shadow-sm border border-[var(--glass-border)] hover:border-primary/50 hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary/20 hover:scale-105 active:scale-95 group/profile flex-shrink-0">
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/profile:opacity-100 transition-opacity z-10 pointer-events-none" />
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="w-full h-full object-cover relative z-0"
              referrerPolicy="no-referrer"
            />
          ) : (
             <div className="w-full h-full bg-gradient-to-br from-indigo-500 hover:from-indigo-400 to-purple-500 hover:to-purple-400 flex items-center justify-center text-white relative z-0 shadow-inner">
               <User size={18} strokeWidth={2.5} />
             </div>
          )}
        </button>
      </div>
    </header>
  );
}
