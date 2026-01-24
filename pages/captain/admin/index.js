/**
 * Admin Dashboard - Multi-venue management
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 * /captain/admin - Admin dashboard for managers
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Building2, Settings, Download, Shield, Key,
  ChevronRight, RefreshCw, ArrowLeft
} from 'lucide-react';
import MultiVenueDashboard from '../../../src/components/captain/admin/MultiVenueDashboard';
import AuditLogViewer from '../../../src/components/captain/admin/AuditLogViewer';
import ExportManager from '../../../src/components/captain/admin/ExportManager';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'exports', label: 'Data Exports', icon: Download },
  { id: 'audit', label: 'Audit Logs', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [venues, setVenues] = useState([]);
  const [summary, setSummary] = useState({});
  const [exports, setExports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login');
        return;
      }

      // Load venues with summary
      const venuesRes = await fetch('/api/captain/admin/venues?summary=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const venuesData = await venuesRes.json();
      if (venuesData.venues) {
        setVenues(venuesData.venues);
        setSummary(venuesData.summary || {});
      }

      // Load exports
      const exportsRes = await fetch('/api/captain/exports', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const exportsData = await exportsRes.json();
      if (exportsData.exports) {
        setExports(exportsData.exports);
      }

    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async (filters = {}) => {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const params = new URLSearchParams();
      if (selectedVenue) params.set('venue_id', selectedVenue.id);
      if (filters.category) params.set('action_category', filters.category);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const res = await fetch(`/api/captain/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.logs) {
        setAuditLogs(data.logs);
      }
    } catch (err) {
      console.error('Audit logs error:', err);
    }
  };

  const handleCreateExport = async (formData) => {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const venueId = selectedVenue?.id || venues[0]?.id;
      if (!venueId) return;

      const res = await fetch('/api/captain/exports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: venueId,
          ...formData
        })
      });
      const data = await res.json();
      if (data.export) {
        setExports([data.export, ...exports]);
      }
    } catch (err) {
      console.error('Create export error:', err);
    }
  };

  const handleDownloadExport = (exportJob) => {
    if (exportJob.file_url) {
      // For data URLs, create download link
      const link = document.createElement('a');
      link.href = exportJob.file_url;
      link.download = `${exportJob.export_type}_export.${exportJob.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleVenueSelect = (venue) => {
    setSelectedVenue(venue);
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, selectedVenue]);

  return (
    <>
      <Head>
        <title>Admin Dashboard | Smarter Captain</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ backgroundColor: '#111827', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <header className="border-b" style={{ borderColor: '#374151', backgroundColor: '#1F2937' }}>
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold" style={{ color: '#1877F2' }}>
                Smarter Captain
              </h1>
              <span className="text-gray-600">|</span>
              <span className="font-medium text-white">Admin Dashboard</span>
            </div>
            <button
              onClick={loadAdminData}
              className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="border-b" style={{ borderColor: '#374151', backgroundColor: '#1F2937' }}>
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          {activeTab === 'overview' && (
            <MultiVenueDashboard
              venues={venues}
              summary={summary}
              isLoading={isLoading}
              onVenueSelect={handleVenueSelect}
            />
          )}

          {activeTab === 'exports' && (
            <ExportManager
              exports={exports}
              isLoading={isLoading}
              onCreateExport={handleCreateExport}
              onDownload={handleDownloadExport}
            />
          )}

          {activeTab === 'audit' && (
            <div>
              {venues.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Select Venue</label>
                  <select
                    value={selectedVenue?.id || ''}
                    onChange={(e) => {
                      const v = venues.find(v => v.id === parseInt(e.target.value));
                      setSelectedVenue(v);
                    }}
                    className="px-3 py-2 rounded-lg text-white"
                    style={{ backgroundColor: '#374151', border: 'none' }}
                  >
                    <option value="">All Venues</option>
                    {venues.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <AuditLogViewer
                logs={auditLogs}
                total={auditLogs.length}
                isLoading={isLoading}
                onFilterChange={loadAuditLogs}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div
                className="p-6 rounded-xl border"
                style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
              >
                <h3 className="text-lg font-semibold text-white mb-4">API Keys</h3>
                <p className="text-gray-400 mb-4">
                  Create API keys for external integrations like POS systems, player tracking software, or custom displays.
                </p>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Key size={16} />
                  Manage API Keys
                </button>
              </div>

              <div
                className="p-6 rounded-xl border"
                style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
              >
                <h3 className="text-lg font-semibold text-white mb-4">Venue Settings</h3>
                <p className="text-gray-400 mb-4">
                  Configure venue-specific settings like comp rates, notification preferences, and display options.
                </p>
                <div className="space-y-3">
                  {venues.map(venue => (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ backgroundColor: '#374151' }}
                    >
                      <div className="flex items-center gap-3">
                        <Building2 size={20} className="text-gray-400" />
                        <span className="text-white">{venue.name}</span>
                      </div>
                      <button className="text-blue-400 text-sm hover:underline">
                        Configure
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
