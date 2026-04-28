'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useState } from 'react';

export default function DashboardPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('Compose');

  const inspirations = [
    {
      id: 1,
      author: 'John Doe',
      date: 'May 19, 2025',
      content: 'startup is just a group project that makes money',
      stats: { likes: '351', retweets: '26', views: '15k' },
      avatar: 'https://i.pravatar.cc/150?u=1'
    },
    {
      id: 2,
      author: 'Jane Smith',
      date: 'Feb 19, 2025',
      content: 'Startup success comes down to:\n\n• finding pain\n• fixing pain\n\nthat\'s literally it.',
      stats: { likes: '78', retweets: '7', views: '3k' },
      avatar: 'https://i.pravatar.cc/150?u=2'
    },
    {
      id: 3,
      author: 'Alex River',
      date: 'Dec 07, 2024',
      content: 'Startup idea\n\nrichfast - become rich in weeks not months',
      stats: { likes: '143', retweets: '3', views: '14k' },
      avatar: 'https://i.pravatar.cc/150?u=3'
    },
    {
      id: 4,
      author: 'Sarah Chen',
      date: 'Dec 01, 2024',
      content: 'startup founders -- there is always someone in the enterprise looking to kill your deal',
      stats: { likes: '1.2k', retweets: '89', views: '45k' },
      avatar: 'https://i.pravatar.cc/150?u=4'
    }
  ];

  return (
    <div className="flex h-screen bg-[#111] overflow-hidden text-white flex-col w-full">
      <div className="flex flex-1 overflow-hidden">
      {/* Left Section: Inspirations */}
      <div className="flex-1 overflow-y-auto p-8 border-r border-white/5 custom-scrollbar">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold text-white">
              {t('tweet_inspirations', 'Tweet Inspirations For You')}
            </h1>
            <span className="text-white/40 cursor-help">ⓘ</span>
          </div>
          <p className="text-white/60 text-sm max-w-2xl mb-4">
            {t('inspiration_desc', 'Use these relevant inspirations for your next tweets! Our AI engine selected these for you based on your X account.')}
          </p>
          <button className="text-blue-400 text-sm hover:underline flex items-center gap-1">
            ✎ {t('edit_feed', 'Edit my personalized feed')}
          </button>
        </header>

        <div className="flex justify-end mb-6">
          <button className="text-blue-400/80 text-sm flex items-center gap-2 hover:text-blue-400 transition-colors">
            ⟳ {t('refresh', 'Refresh')}
          </button>
        </div>

        <div className="columns-1 md:columns-2 gap-6 space-y-6">
          {inspirations.map((item) => (
            <div key={item.id} className="break-inside-avoid bg-white/[0.03] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img src={item.avatar} className="w-8 h-8 rounded-full bg-white/10" alt="" />
                  <span className="text-white/40 text-xs font-medium">{item.date}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 text-xs opacity-60">⚡</span>
                  <span className="text-orange-400 text-xs opacity-60">☆</span>
                </div>
              </div>
              <p className="text-white/90 text-[15px] leading-relaxed mb-6 whitespace-pre-wrap font-medium">
                {item.content}
              </p>
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1 text-white/40 text-xs">
                    <span>♡</span> {item.stats.likes}
                  </div>
                  <div className="flex items-center gap-1 text-white/40 text-xs">
                    <span>⇄</span> {item.stats.retweets}
                  </div>
                  <div className="flex items-center gap-1 text-white/40 text-xs">
                    <span>📊</span> {item.stats.views}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-blue-400 text-xs font-bold hover:bg-white/10 transition-colors">
                    {t('edit_tweet', 'Edit & tweet')}
                  </button>
                  <button className="text-white/20 hover:text-white transition-colors">...</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Section: Composer */}
      <div className="w-[400px] flex flex-col bg-[#161616] border-l border-white/10">
        <div className="p-4 border-b border-white/5 flex gap-2">
          <button className="p-2 hover:bg-white/5 rounded-lg text-white/40">⇥</button>
          <button className="p-2 hover:bg-white/5 rounded-lg text-white/40">⛶</button>
        </div>

        <nav className="flex p-1 bg-white/5 m-4 rounded-lg">
          {['Compose', 'Drafts', 'Scheduled', 'Sent'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className="flex-1 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-bold text-sm">{t('your_content', 'Your content')}</h3>
            <button className="text-blue-400 text-xs font-bold hover:underline">+ {t('new_draft', 'New draft')}</button>
          </div>

          <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-2xl p-6 relative group focus-within:border-white/20 transition-all">
            <textarea
              className="w-full h-full bg-transparent border-none outline-none text-white resize-none placeholder:text-white/20 text-[15px]"
              placeholder={t('write_here', 'Write here.\n\nSkip 3 lines to start a thread.')}
            />
            <div className="absolute bottom-4 right-4 text-[10px] text-white/20">
              0 / 280 {t('saved', 'saved')} ✓
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex flex-col gap-4">
          <div className="flex gap-4">
            <button className="text-white/40 hover:text-white transition-colors">📷</button>
            <button className="text-white/40 hover:text-white transition-colors">T</button>
            <button className="text-white/40 hover:text-white transition-colors">📄</button>
            <button className="text-white/40 hover:text-white transition-colors">😀</button>
          </div>
          <button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/10">
            {t('add_to_queue', 'Add to Queue')}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
