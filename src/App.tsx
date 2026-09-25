import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ChatScreen from './screens/ChatScreen';
import DashboardScreen from './screens/DashboardScreen';
import ContentMakerScreen from './screens/ContentMakerScreen';
import DictionaryScreen from './screens/DictionaryScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import AdminScreen from './screens/AdminScreen';
import UpgradeModal from './components/UpgradeModal';
import OnboardingModal from './components/OnboardingModal';
import PageTransition from './components/PageTransition';
import SEOHead from './components/SEOHead';
import { Plus, AlertCircle, Lock, X } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useLanguage } from './context/LanguageContext';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [currentScreen, setCurrentScreen] = useState('chat');
  const [isNavigating, setIsNavigating] = useState(false);
  const isNavigatingRef = useRef(false);
  const navigationLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateToScreen = useCallback((newScreen: string) => {
    if (newScreen === currentScreen) return;
    if (isNavigatingRef.current) return;

    isNavigatingRef.current = true;
    setIsNavigating(true);
    setCurrentScreen(newScreen);

    if (navigationLockTimeoutRef.current) {
      clearTimeout(navigationLockTimeoutRef.current);
    }
    // Safety release lock after transition duration (400ms fade-out + 120ms pause + 400ms fade-in = 920ms)
    navigationLockTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
      setIsNavigating(false);
    }, 1000);
  }, [currentScreen]);

  const handleTransitionComplete = useCallback(() => {
    isNavigatingRef.current = false;
    setIsNavigating(false);
    if (navigationLockTimeoutRef.current) {
      clearTimeout(navigationLockTimeoutRef.current);
    }
  }, []);

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [userStatus, setUserStatus] = useState<'Basick' | 'pro' | 'Band'>('Basick');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        
        try {
          const docSnap = await getDoc(userRef);
          if (!docSnap.exists()) {
            // First time login: ensure the full app is in English
            setLanguage('en');
            localStorage.setItem('appLanguage', 'en');
            await setDoc(userRef, {
              email: currentUser.email,
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              status: 'Basick',
              preferredLanguage: 'en',
              createdAt: new Date()
            }, { merge: true });
            setIsOnboardingModalOpen(true);
          } else {
            const data = docSnap.data();
            if (data.preferredLanguage && ['en', 'bn', 'zh', 'hi', 'es', 'fr'].includes(data.preferredLanguage)) {
              setLanguage(data.preferredLanguage as any);
            }
            if (!data.onboardingCompleted) {
              setIsOnboardingModalOpen(true);
            }
          }
        } catch (error) {
          console.error("Firestore user fetch error (rules may not be configured):", error);
        }
        
        // Listen to user status changes
        const unsubUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setUserStatus(snap.data().status || 'Basick');
          }
        }, (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          } catch (e) {
            // Fallback gracefully to default 'Basick' tier
            setUserStatus('Basick');
          }
        });

        // Check if admin
        const adminsRef = doc(db, 'settings', 'admins');
        const unsubAdmins = onSnapshot(adminsRef, (snap) => {
          if (snap.exists()) {
            const emails = snap.data().emails || [];
            setIsAdmin(emails.includes(currentUser.email));
          } else {
            // If settings/admins doesn't exist, the default is the specific email
            setIsAdmin(currentUser.email === 'ashtosh.biswas.2026@gmail.com');
          }
        }, (error) => {
          // Fallback to default admin check if permission denied
          console.warn("Could not read admins list, falling back to default admin.", error);
          setIsAdmin(currentUser.email === 'ashtosh.biswas.2026@gmail.com');
        });

        setLoading(false);
        return () => {
          unsubUser();
          unsubAdmins();
        };
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Global Keyboard Shortcuts (Cmd/Ctrl + K, Esc)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K => Open new chat
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCurrentChatId(null);
        setInitialPrompt('');
        navigateToScreen('chat');
        setTimeout(() => {
          document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
        }, 100);
      }

      // Esc => Close modals and sidebar
      if (e.key === 'Escape') {
        if (isUpgradeModalOpen) {
          setIsUpgradeModalOpen(false);
        }
        if (isSidebarOpen) {
          setIsSidebarOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isUpgradeModalOpen, isSidebarOpen]);

  const toggleTheme = () => setIsDark(!isDark);

  const handleToolClick = (toolId: string) => {
    if (toolId === 'content-maker') {
      navigateToScreen('content-maker');
      return;
    }
    if (toolId === 'dictionary') {
      navigateToScreen('dictionary');
      return;
    }

    let prompt = '';
    switch (toolId) {
      case 'code':
        prompt = t.promptCode;
        break;
      case 'writer':
        prompt = t.promptWriter;
        break;
      case 'summarize':
        prompt = t.promptSummarize;
        break;
      case 'brainstorm':
        prompt = t.promptBrainstorm;
        break;
      case 'translate':
        prompt = language === 'bn' ? 'নিচের লেখাটি অনুবাদ এবং ব্যাকরণ সংশোধন করুন: ' : 'Translate and polish the following text: ';
        break;
      case 'data':
        prompt = language === 'bn' ? 'নিচের ডেটা বা সমস্যাটি বিশ্লেষণ করুন: ' : 'Analyze the following data or problem: ';
        break;
      case 'chat':
      default:
        prompt = '';
        break;
    }
    // Always start a fresh new chat session when a tool feature is selected
    setCurrentChatId(null);
    setInitialPrompt(prompt);
    navigateToScreen('chat');
  };

  useEffect(() => {
    if (isFocusMode) {
      setIsSidebarOpen(false);
    }
  }, [isFocusMode]);

  useEffect(() => {
    if (user && userStatus === 'Band' && user.email === 'ashtosh.biswas.2026@gmail.com') {
      updateDoc(doc(db, 'users', user.uid), { status: 'Basick' });
    }
  }, [user, userStatus]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (userStatus === 'Band') {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="max-w-md w-full bg-[var(--card)] border border-red-500/20 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 mx-auto bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-3xl font-display font-bold text-[var(--text)] mb-3 tracking-tight">Account Banned</h1>
          <p className="text-[var(--text-muted)] mb-8">Your account has been restricted from accessing this application. Please contact support for more information.</p>
          <button 
            onClick={() => auth.signOut()}
            className="w-full py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-[var(--text)] font-medium hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <DashboardScreen onToolClick={handleToolClick} onUpgradeClick={() => setIsUpgradeModalOpen(true)} userStatus={userStatus} />;
      case 'content-maker':
        return (
          <ContentMakerScreen 
            onBack={() => navigateToScreen('dashboard')} 
            onSendToChat={(content) => {
              setCurrentChatId(null);
              setInitialPrompt(content);
              navigateToScreen('chat');
            }} 
            onUpgradeClick={() => setIsUpgradeModalOpen(true)}
          />
        );
      case 'dictionary':
        return (
          <DictionaryScreen 
            onBack={() => navigateToScreen('dashboard')} 
            onSendToChat={(content) => {
              setCurrentChatId(null);
              setInitialPrompt(content);
              navigateToScreen('chat');
            }} 
          />
        );
      case 'settings':
        return <SettingsScreen toggleTheme={toggleTheme} isDark={isDark} onOpenOnboarding={() => setIsOnboardingModalOpen(true)} />;
      case 'admin':
        return <AdminScreen />;
      case 'chat':
      default:
        return <ChatScreen 
                 initialPrompt={initialPrompt} 
                 clearInitialPrompt={() => setInitialPrompt('')} 
                 currentChatId={currentChatId}
                 setCurrentChatId={setCurrentChatId}
                 setCurrentScreen={navigateToScreen}
                 isFocusMode={isFocusMode}
                 onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
               />;
    }
  };

  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'dashboard':
        return t.aiTools;
      case 'content-maker':
        return language === 'bn' ? 'কন্টেন্ট মেকার' : 'Content Maker';
      case 'dictionary':
        return language === 'bn' ? 'অভিধান' : 'Dictionary';
      case 'settings':
        return t.settings;
      case 'admin':
        return 'Admin Panel';
      case 'chat':
      default:
        return t.novaAiChat;
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--bg)] text-[var(--text)] overflow-hidden font-sans relative selection:bg-primary/30">
      <SEOHead screenKey={currentScreen} />
      
      {/* Immersive Atmospheric Background (Only visible in Dark Mode) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-100 transition-opacity duration-1000">
        {isDark ? (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[140px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
          </>
        ) : (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
          </>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentScreen={currentScreen}
        setCurrentScreen={(screen) => {
          navigateToScreen(screen);
          if (screen === 'admin' && window.innerWidth < 768) {
            setIsSidebarOpen(false);
          }
        }}
        currentChatId={currentChatId}
        setCurrentChatId={setCurrentChatId}
        user={user}
        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
        isAdmin={isAdmin}
        isFocusMode={isFocusMode}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar
          title={getScreenTitle()}
          onMenuClick={() => setIsSidebarOpen(true)}
          isSidebarOpen={isSidebarOpen}
          user={user}
          isFocusMode={isFocusMode}
          onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
        />
        
        <main className="flex-1 relative overflow-hidden bg-transparent">
          <PageTransition
            screenKey={currentScreen}
            onAnimationComplete={handleTransitionComplete}
          >
            {renderScreen()}
          </PageTransition>
        </main>
      </div>

      <UpgradeModal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
      />

      <OnboardingModal
        isOpen={isOnboardingModalOpen}
        initialDisplayName={user.displayName || ''}
        initialEmail={user.email || ''}
        onClose={(selectedPrompt) => {
          setIsOnboardingModalOpen(false);
          if (selectedPrompt) {
            setCurrentChatId(null);
            setInitialPrompt(selectedPrompt);
            navigateToScreen('chat');
          }
        }}
      />
    </div>
  );
}
