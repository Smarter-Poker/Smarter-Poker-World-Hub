/**
 * Documentation Index
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6, Step 6.4
 *
 * Central hub for all Commander documentation
 */
import Head from 'next/head';
import Link from 'next/link';
import {
  ChevronLeft,
  BookOpen,
  Users,
  Settings,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  FileText,
} from 'lucide-react';

const DOCUMENTATION = [
  {
    id: 'staff-guide',
    title: 'Staff Training Guide',
    description: 'Learn how to manage waitlists, seat players, handle notifications, and support tournaments as floor staff.',
    icon: Users,
    href: '/commander/docs/staff-guide',
    audience: 'Floor Staff, Brush',
    sections: ['Getting Started', 'Waitlist Management', 'Game Operations', 'Notifications', 'Tournament Support', 'Promotions'],
  },
  {
    id: 'manager-guide',
    title: 'Manager Admin Guide',
    description: 'Configure your venue, manage staff, set up promotions, and access analytics and reports.',
    icon: Settings,
    href: '/commander/docs/manager-guide',
    audience: 'Managers, Owners',
    sections: ['Venue Setup', 'Staff Management', 'Analytics', 'Promotions', 'Tournaments', 'Security'],
  },
  {
    id: 'faq',
    title: 'Player FAQ',
    description: 'Answers to common questions about using Club Commander as a player.',
    icon: HelpCircle,
    href: '/hub/commander/faq',
    audience: 'Players',
    sections: ['Waitlist', 'Notifications', 'Tournaments', 'Home Games', 'Rewards', 'Account'],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting Guide',
    description: 'Diagnose and resolve common technical issues with step-by-step solutions.',
    icon: AlertTriangle,
    href: '/commander/docs/troubleshooting',
    audience: 'All Staff',
    sections: ['Connectivity', 'Notifications', 'Authentication', 'Data Issues', 'Devices', 'Tournaments'],
  },
];

const QUICK_LINKS = [
  { label: 'API Documentation', href: '/commander/docs/api', icon: FileText },
  { label: 'Status Page', href: 'https://status.smarter.poker', icon: ExternalLink, external: true },
  { label: 'Contact Support', href: 'mailto:support@smarter.poker', icon: ExternalLink, external: true },
];

export default function DocumentationIndexPage() {
  return (
    <>
      <Head>
        <title>Documentation | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page min-h-screen">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/commander/dashboard" className="text-[#64748B] hover:text-white">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-[#22D3EE]" />
                <h1 className="text-xl font-bold text-white">Documentation</h1>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Club Commander Documentation</h2>
            <p className="text-[#94A3B8] max-w-2xl mx-auto">
              Everything you need to know about using Club Commander. Select a guide below based on your role.
            </p>
          </div>

          {/* Documentation Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {DOCUMENTATION.map((doc) => {
              const Icon = doc.icon;
              return (
                <Link
                  key={doc.id}
                  href={doc.href}
                  className="cmd-panel p-6 hover:border-[#22D3EE]/50 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#22D3EE]/10 rounded-lg flex items-center justify-center group-hover:bg-[#22D3EE]/20 transition-colors">
                      <Icon className="w-6 h-6 text-[#22D3EE]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-[#22D3EE] transition-colors">
                        {doc.title}
                      </h3>
                      <p className="text-[#64748B] text-sm mb-3">{doc.description}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs bg-[#374151] text-[#94A3B8] px-2 py-1 rounded">
                          {doc.audience}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {doc.sections.slice(0, 4).map((section, idx) => (
                          <span
                            key={idx}
                            className="text-xs text-[#64748B] bg-[#1E293B] px-2 py-0.5 rounded"
                          >
                            {section}
                          </span>
                        ))}
                        {doc.sections.length > 4 && (
                          <span className="text-xs text-[#64748B]">
                            +{doc.sections.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Quick Links */}
          <div className="cmd-panel p-6">
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {QUICK_LINKS.map((link, idx) => {
                const Icon = link.icon;
                const LinkComponent = link.external ? 'a' : Link;
                const linkProps = link.external
                  ? { href: link.href, target: '_blank', rel: 'noopener noreferrer' }
                  : { href: link.href };

                return (
                  <LinkComponent
                    key={idx}
                    {...linkProps}
                    className="flex items-center gap-3 p-3 bg-[#1E293B] rounded-lg hover:bg-[#374151] transition-colors"
                  >
                    <Icon className="w-5 h-5 text-[#64748B]" />
                    <span className="text-[#94A3B8]">{link.label}</span>
                    {link.external && <ExternalLink className="w-4 h-4 text-[#64748B] ml-auto" />}
                  </LinkComponent>
                );
              })}
            </div>
          </div>

          {/* Need Help */}
          <div className="text-center mt-12">
            <p className="text-[#64748B] mb-4">Can't find what you're looking for?</p>
            <a
              href="mailto:support@smarter.poker"
              className="cmd-btn cmd-btn-primary inline-flex items-center gap-2"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
