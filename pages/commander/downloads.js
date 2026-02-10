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
      icon: '',
      filename: 'Club.Commander.Setup.1.0.0.exe',
      size: '72.9 MB',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/Club.Commander.Setup.1.0.0.exe',
      altDownload: {
        name: 'Portable Version',
        filename: 'Club.Commander.1.0.0.exe',
        url: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/Club.Commander.1.0.0.exe'
      },
      requirements: ['Windows 10 or later', '4GB RAM minimum', '200MB disk space']
    },
    mac: {
      name: 'macOS',
      icon: '',
      filename: 'Club.Commander-1.0.0-arm64.dmg',
      size: '89.8 MB',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/Club.Commander-1.0.0-arm64.dmg',
      altDownload: {
        name: 'ZIP Archive',
        filename: 'Club.Commander-1.0.0-arm64-mac.zip',
        url: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/Club.Commander-1.0.0-arm64-mac.zip'
      },
      requirements: ['macOS 11 (Big Sur) or later', 'Apple Silicon (M1/M2/M3)', '4GB RAM minimum', '200MB disk space']
    },
    linux: {
      name: 'Linux',
      icon: '',
      filename: 'Club.Commander-1.0.0.AppImage',
      size: '99.6 MB',
      downloadUrl: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/Club.Commander-1.0.0.AppImage',
      altDownload: {
        name: 'Debian Package',
        filename: 'club-commander_1.0.0_amd64.deb',
        url: 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v1.0.0/club-commander_1.0.0_amd64.deb'
      },
      requirements: ['Ubuntu 20.04+ or equivalent', '4GB RAM minimum', '200MB disk space']
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
            <div className="w-20 h-20 bg-[#1877F2] rounded-2xl flex items-center justify-center text-4xl text-white">CC</div>
          </div>
          <h1 className="text-4xl font-bold text-[#E4E6EB] mb-3">Club Commander Desktop</h1>
          <p className="text-[#B0B3B8] text-lg">The fastest way to manage your poker room</p>
          <p className="text-[#31A24C] text-sm mt-2">✓ Version 1.0.0 - Released February 2026</p>
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
                
                {p.name}
              </button>
            ))}
          </div>

          {/* Download Button */}
          <div className="text-center mb-8">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full max-w-md bg-[#1877F2] hover:bg-[#1664d9] disabled:bg-[#3A3B3C] text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors"
            >
              {downloading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Starting Download...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download for {currentPlatform.name}
                </span>
              )}
            </button>
            <p className="text-[#B0B3B8] text-sm mt-3">
              {currentPlatform.filename} ({currentPlatform.size})
            </p>
            {currentPlatform.altDownload && (
              <a 
                href={currentPlatform.altDownload.url}
                className="text-[#1877F2] hover:underline text-sm mt-2 inline-block"
              >
                Or download {currentPlatform.altDownload.name} →
              </a>
            )}
          </div>

          {/* Requirements */}
          <div className="border-t border-[#3A3B3C] pt-6">
            <h3 className="text-[#E4E6EB] font-medium mb-3">System Requirements</h3>
            <ul className="text-[#B0B3B8] text-sm space-y-1">
              {currentPlatform.requirements.map((req, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-[#31A24C]">✓</span> {req}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4 mb-8">
          {features.map((feature, i) => (
            <div key={i} className="bg-[#242526] rounded-lg p-4 border border-[#3A3B3C]">
              <h4 className="text-[#E4E6EB] font-medium mb-1">{feature.title}</h4>
              <p className="text-[#B0B3B8] text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* All Downloads Link */}
        <div className="text-center">
          <a 
            href="https://github.com/Smarter-Poker/club-commander-desktop/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1877F2] hover:underline"
          >
            View all releases on GitHub →
          </a>
        </div>

        {/* Back to Login */}
        <div className="text-center mt-8">
          <Link href="/commander/login" className="text-[#B0B3B8] hover:text-[#E4E6EB]">
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
