import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function DownloadsPage() {
  const [platform, setPlatform] = useState('windows');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('mac')) {
      setPlatform('mac');
    } else if (userAgent.includes('linux')) {
      setPlatform('linux');
    } else {
      setPlatform('windows');
    }
  }, []);

  const platforms = {
    windows: {
      name: 'Windows',
      icon: '🪟',
      filename: 'ClubCommander-Setup-1.0.0.exe',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/ClubCommander-Setup-1.0.0.exe',
      requirements: ['Windows 10 or later', '4GB RAM minimum', '200MB disk space']
    },
    mac: {
      name: 'macOS',
      icon: '🍎',
      filename: 'ClubCommander-1.0.0.dmg',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/ClubCommander-1.0.0.dmg',
      requirements: ['macOS 10.15 (Catalina) or later', '4GB RAM minimum', '200MB disk space']
    },
    linux: {
      name: 'Linux',
      icon: '🐧',
      filename: 'ClubCommander-1.0.0.AppImage',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/ClubCommander-1.0.0.AppImage',
      requirements: ['Ubuntu 18.04+ or equivalent', '4GB RAM minimum', '200MB disk space']
    }
  };

  const currentPlatform = platforms[platform];

  const handleDownload = () => {
    setDownloading(true);
    window.location.href = currentPlatform.downloadUrl;
    setTimeout(() => setDownloading(false), 3000);
  };

  const features = [
    { title: 'Native Desktop Experience', desc: 'Faster performance and offline capabilities' },
    { title: 'Auto-Updates', desc: 'Always stay on the latest version automatically' },
    { title: 'Print Support', desc: 'Print player lists, reports, and receipts directly' },
    { title: 'Quick Launch', desc: 'Launch from your desktop or taskbar instantly' }
  ];

  return (
    <div className="min-h-screen bg-[#18191A]">
      <Head>
        <title>Download Club Commander - Desktop App</title>
      </Head>

      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-[#1877F2] rounded-2xl flex items-center justify-center text-4xl text-white">&#9824;</div>
          </div>
          <h1 className="text-4xl font-bold text-[#E4E6EB] mb-3">Club Commander Desktop</h1>
          <p className="text-[#B0B3B8] text-lg">The fastest way to manage your poker room</p>
        </div>

        {/* Main Download Card */}
        <div className="max-w-2xl mx-auto bg-[#242526] rounded-xl p-8 border border-[#3A3B3C] mb-8">
          {/* Platform Tabs */}
          <div className="flex justify-center gap-2 mb-8">
            {Object.entries(platforms).map(([key, p]) => (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                  platform === key
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-[#3A3B3C] text-[#B0B3B8] hover:bg-[#4E4F50]'
                }`}
              >
                <span className="mr-2">{p.icon}</span>
                {p.name}
              </button>
            ))}
          </div>

          {/* Download Button */}
          <div className="text-center mb-8">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#1877F2] hover:bg-[#166FE5] text-white text-xl font-semibold rounded-xl transition-colors disabled:opacity-70"
            >
              {downloading ? (
                <>
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Starting Download...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download for {currentPlatform.name}
                </>
              )}
            </button>
            <p className="text-[#B0B3B8] text-sm mt-3">{currentPlatform.filename}</p>
          </div>

          {/* System Requirements */}
          <div className="bg-[#3A3B3C] rounded-lg p-5">
            <h3 className="text-[#E4E6EB] font-semibold mb-3">System Requirements</h3>
            <ul className="space-y-2">
              {currentPlatform.requirements.map((req, i) => (
                <li key={i} className="text-[#B0B3B8] text-sm flex items-center gap-2">
                  <span className="text-[#31A24C]">{'\u2713'}</span>
                  {req}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#E4E6EB] text-center mb-8">Why Use the Desktop App?</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div key={i} className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-5">
                <h3 className="text-[#E4E6EB] font-semibold mb-2">{feature.title}</h3>
                <p className="text-[#B0B3B8] text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alternative Links */}
        <div className="max-w-2xl mx-auto mt-12 text-center">
          <p className="text-[#B0B3B8] mb-4">Prefer the web version?</p>
          <div className="flex justify-center gap-4">
            <Link href="/commander/login" className="text-[#1877F2] hover:underline font-medium">
              Open Web App
            </Link>
            <span className="text-[#3A3B3C]">|</span>
            <Link href="/commander/register" className="text-[#1877F2] hover:underline font-medium">
              Create Account
            </Link>
          </div>
        </div>

        {/* Version Info */}
        <div className="text-center mt-12 text-[#B0B3B8] text-sm">
          <p>Version 1.0.0 | Released February 2026</p>
          <p className="mt-1">
            <a href="https://github.com/Smarter-Poker/club-commander-desktop/releases" className="text-[#1877F2] hover:underline">
              View all releases
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
