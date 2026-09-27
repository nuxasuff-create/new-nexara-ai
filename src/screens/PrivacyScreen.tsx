import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Shield, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface PrivacyScreenProps {
  onBack: () => void;
}

export default function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  const { t, language } = useLanguage();

  const isBn = language === 'bn';

  return (
    <div className="h-full overflow-y-auto px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] mb-8 transition-colors group"
        >
          <div className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] group-hover:border-primary/50 transition-all">
            <ChevronLeft size={18} />
          </div>
          <span className="font-medium">{isBn ? 'পিছনে যান' : 'Go Back'}</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-6 md:p-10 shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Shield size={120} />
          </div>

          <h1 className="text-3xl md:text-4xl font-display font-bold mb-6 tracking-tight text-[var(--text)]">
            {t.privacyPolicy}
          </h1>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-[var(--text-muted)] leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-[var(--text)] mb-3">
                {isBn ? '১. আমরা কী তথ্য সংগ্রহ করি' : '1. Information We Collect'}
              </h2>
              <p>
                {isBn 
                  ? 'Nexara AI ব্যবহার করার সময় আমরা আপনার ইমেইল ঠিকানা, প্রোফাইল তথ্য এবং আপনার চ্যাট মেসেজগুলো সংগ্রহ করি। এছাড়া আপনি যদি কোনো ছবি আপলোড করেন, তবে সেই ছবিগুলোও আমাদের সার্ভারে সাময়িকভাবে সংরক্ষিত হয় যাতে এআই তা বিশ্লেষণ করতে পারে।'
                  : 'When you use Nexara AI, we collect your email address, profile information, and chat messages. Additionally, if you upload images, those images are temporarily stored on our servers for AI analysis.'}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[var(--text)] mb-3">
                {isBn ? '২. তথ্যের ব্যবহার' : '2. How We Use Your Information'}
              </h2>
              <p>
                {isBn
                  ? 'আপনার দেওয়া তথ্যগুলো মূলত আপনাকে এআই রেসপন্স প্রদান করার জন্য ব্যবহার করা হয়। আপনার মেসেজ এবং ছবিগুলো আমাদের তৃতীয় পক্ষের এআই প্রোভাইডার (যেমন: Groq, Gemini, Anthropic) এর কাছে পাঠানো হয় যাতে তারা সঠিক উত্তর জেনারেট করতে পারে।'
                  : 'Your information is primarily used to provide AI responses. Your messages and images are sent to our third-party AI providers (e.g., Groq, Gemini, Anthropic) to generate accurate responses.'}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[var(--text)] mb-3">
                {isBn ? '৩. ডেটা সংরক্ষণ' : '3. Data Retention'}
              </h2>
              <p>
                {isBn
                  ? 'আপনার চ্যাট ইতিহাস আমাদের ডাটাবেসে সংরক্ষিত থাকে যাতে আপনি পরবর্তীতে সেগুলো দেখতে পারেন। আপনি চাইলে যেকোনো সময় আপনার চ্যাট বা পুরো অ্যাকাউন্ট ডিলিট করে দিতে পারেন।'
                  : 'Your chat history is stored in our database so you can access it later. You can delete your chats or your entire account at any time.'}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[var(--text)] mb-3">
                {isBn ? '৪. তৃতীয় পক্ষের পরিষেবা' : '4. Third-Party Services'}
              </h2>
              <p>
                {isBn
                  ? 'আমরা আমাদের অ্যাপ্লিকেশনে Google Analytics ব্যবহার করি ইউজার এক্সপেরিয়েন্স উন্নত করার জন্য। এছাড়া আমাদের এআই মডেলগুলো Groq, Google (Gemini), এবং অন্যান্য নিরাপদ এআই প্রোভাইডার দ্বারা পরিচালিত হয়।'
                  : 'We use Google Analytics in our application to improve user experience. Additionally, our AI models are powered by Groq, Google (Gemini), and other secure AI providers.'}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[var(--text)] mb-3">
                {isBn ? '৫. আপনার অধিকার' : '5. Your Rights'}
              </h2>
              <p>
                {isBn
                  ? 'আপনার নিজের ডেটা অ্যাক্সেস করার, সংশোধন করার বা মুছে ফেলার পূর্ণ অধিকার আপনার রয়েছে। যেকোনো প্রয়োজনে আপনি আমাদের সাথে যোগাযোগ করতে পারেন।'
                  : 'You have the full right to access, rectify, or delete your own data. You can contact us for any assistance.'}
              </p>
            </section>

            <div className="pt-8 mt-8 border-t border-[var(--border)] text-sm italic">
              {isBn 
                ? 'সর্বশেষ আপডেট: ২৬ সেপ্টেম্বর, ২০২৬' 
                : 'Last Updated: September 26, 2026'}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
