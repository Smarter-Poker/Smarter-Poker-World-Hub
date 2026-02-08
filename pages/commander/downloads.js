import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const RELEASES = {
  current: {
    version: '1.0.0',
    date: '2026-02-08',
    notes: 'Initial release of Club Commander Desktop'
  }
};

const PLATFORMS = [
  {
    id: 'windows',
    name: 'Windows',
    icon: '🪟',
    description: 'Windows 10/11 (64-bit)',
    files: [
      {
        name: 'Club Commander Setup',
        filename: 'ClubCommander-Setup-1.0.0.exe',
        size: '~85 MB',
        type: 'Installer (Recommended)'
      },
      {
        name: 'Club Commander Portable',
        filename: 'ClubCommander-1.0.0-portable.exe',
        size: '~85 MB',
        type: 'Portable (No install required)'
      }
    ]
  },
  {
    id: 'mac',
    name: 'macOS',
    icon: '🍎',
    description: 'macOS 11+ (Intel & Apple Silicon)',
    files: [
      {
        name: 'Club Commander',
        filename: 'ClubCommander-1.0.0.dmg',
        size: '~90 MB',
        type: 'Disk Image (Recommended)'
      },
      {
        name: 'Club Commander (ZIP)',
        filename: 'ClubCommander-1.0.0-mac.zip',
        size: '~88 MB',
        type: 'ZIP Archive'
      }
    ]
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: '🐧',
    description: 'Ubuntu 20.04+, Debian 10+',
    files: [
      {
        name: 'Club Commander AppImage',
        filename: 'ClubCommander-1.0.0.AppImage',
        size: '~95 MB',
        type: 'AppImage (Universal)'
      },
      {
        name: 'Club Commander DEB',
        filename: 'clubcommander_1.0.0_amd64.deb',
        size: '~65 MB',
        type: 'Debian Package'
      }
    ]
  }
];

const FEATURES = [
  {
    icon: '🖥️',
    title: 'Native Desktop Experience',
    description: 'Runs as a standalone app with system tray support'
  },
  {
    icon: '🔄',
    title: 'Auto Updates',
    description: 'Automatically downloads and installs new versions'
  },
  {
    icon: '🖨️',
    title: 'Print Support',
    description: 'Native print dialogs for reports and receipts'
  },
  {
    icon: '⚡',
    title: 'Quick Launch',
    description: 'Desktop shortcut for instant access'
  }
];

export default function DownloadsPage() {
  const [detectedPlatform, setDetectedPlatform] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  useEffect(() => {
    // Detect user's platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('win')) {
      setDetectedPlatform('windows');
      setSelectedPlatform('windows');
    } else if (userAgent.includes('mac')) {
      setDetectedPlatform('mac');
      setSelectedPlatform('mac');
    } else if (userAgent.includes('linux')) {
      setDetectedPlatform('linux');
      setSelectedPlatform('linux');
    } else {
      setSelectedPlatform('windows');
    }
  }, []);

  const getDownloadUrl = (filename) => {
    return `https://github.com/Smarter-Poker/club-commander-desktop/releases/download/v${RELEASES.current.version}/${filename}`;
  };

  const currentPlatform = PLATFORMS.find(p => p.id === selectedPlatform);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Head>
        <title>Download Club Commander - Poker Room Management Software</title>
        <meta name="description" content="Download Club Commander desktop app for Windows, Mac, and Linux. Professional poker room management software." />
      </Head>

      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/30">
              <span className="text-5xl">♠️</span>
            </div>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Club Commander
          </h1>
          <p className="text-xl text-gray-400 mb-2">
            Professional Poker Room Management Software
          </p>
          <p className="text-gray-500">
            Version {RELEASES.current.version} • Released {RELEASES.current.date}
          </p>
        </div>

        {/* Platform Tabs */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex justify-center gap-2 p-1 bg-gray-800/50 rounded-xl">
            {PLATFORMS.map(platform => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                  selectedPlatform === platform.id
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <span className="text-xl">{platform.icon}</span>
                <span>{platform.name}</span>
                {detectedPlatform === platform.id && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Your OS</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Download Cards */}
        {currentPlatform && (
          <div className="max-w-3xl mx-auto mb-12">
            <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
              <div className="text-center mb-6">
                <span className="text-4xl mb-2 block">{currentPlatform.icon}</span>
                <h2 className="text-2xl font-semibold text-white">{currentPlatform.name}</h2>
                <p className="text-gray-400">{currentPlatform.description}</p>
              </div>

              <div className="space-y-4">
                {currentPlatform.files.map((file, idx) => (
                  <a
                    key={idx}
                    href={getDownloadUrl(file.filename)}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                      idx === 0
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30'
                        : 'bg-gray-700/50 hover:bg-gray-700 border border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        idx === 0 ? 'bg-white/20' : 'bg-gray-600'
                      }`}>
                        <span className="text-2xl">⬇️</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{file.name}</h3>
                        <p className={`text-sm ${idx === 0 ? 'text-white/70' : 'text-gray-400'}`}>
                          {file.type} • {file.size}
                        </p>
                      </div>
                    </div>
                    <div className={`px-4 py-2 rounded-lg font-medium ${
                      idx === 0 ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'
                    }`}>
                      Download
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div className="max-w-4xl mx-auto mb-12">
          <h2 className="text-2xl font-semibold text-white text-center mb-8">Desktop App Features</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className="bg-gray-800/30 rounded-xl p-5 text-center border border-gray-700/50">
                <span className="text-3xl mb-3 block">{feature.icon}</span>
                <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* System Requirements */}
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl font-semibold text-white text-center mb-6">System Requirements</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/50">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span>🪟</span> Windows
              </h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Windows 10 or later</li>
                <li>• 64-bit processor</li>
                <li>• 4 GB RAM minimum</li>
                <li>• 200 MB disk space</li>
              </ul>
            </div>
            <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/50">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span>🍎</span> macOS
              </h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• macOS 11 (Big Sur) or later</li>
                <li>• Intel or Apple Silicon</li>
                <li>• 4 GB RAM minimum</li>
                <li>• 250 MB disk space</li>
              </ul>
            </div>
            <div className="bg-gray-800/30 rounded-xl p-5 border border-gray-700/50">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span>🐧</span> Linux
              </h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Ubuntu 20.04+ / Debian 10+</li>
                <li>• 64-bit processor</li>
                <li>• 4 GB RAM minimum</li>
                <li>• 200 MB disk space</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Web Version CTA */}
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-gray-800/30 rounded-2xl p-8 border border-gray-700/50">
            <h3 className="text-xl font-semibold text-white mb-2">Prefer the Web Version?</h3>
            <p className="text-gray-400 mb-4">
              Access Club Commander from any browser without installing anything.
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/commander/login" className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-500 transition-all font-medium">
                Open Web App
              </Link>
              <Link href="/commander/register" className="px-6 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-all font-medium">
                Create Account
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>© 2026 Smarter.Poker • <Link href="/legal/terms" className="hover:text-white">Terms</Link> • <Link href="/legal/privacy" className="hover:text-white">Privacy</Link></p>
        </div>
      </div>
    </div>
  );
}
