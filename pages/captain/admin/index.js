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
  ChevronRight, RefreshCw, ArrowLeft, X, Plus, Trash2,
  Copy, Eye, EyeOff, Loader2, Check
} from 'lucide-react';
import MultiVenueDashboard from '../../../src/components/captain/admin/MultiVenueDashboard';
import AuditLogViewer from '../../../src/components/captain/admin/AuditLogViewer';
import ExportManager from '../../../src/components/captain/admin/ExportManager';

// API Keys Modal
function ApiKeysModal({ isOpen, onClose }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showKey, setShowKey] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    if (isOpen) loadApiKeys();
  }, [isOpen]);

  async function loadApiKeys() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/admin/api-keys', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.data?.keys || []);
      }
    } catch (err) {
      console.error('Load API keys error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newKeyName })
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys([data.data.key, ...apiKeys]);
        setNewKeyName('');
        // Show the new key briefly
        setShowKey({ [data.data.key.id]: true });
      }
    } catch (err) {
      console.error('Create API key error:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(keyId) {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/captain/admin/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
    } catch (err) {
      console.error('Delete API key error:', err);
    }
  }

  function handleCopyKey(key) {
    navigator.clipboard.writeText(key.api_key);
    setCopiedKey(key.id);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1F2937] rounded-xl w-full max-w-lg border border-[#374151]">
        <div className="flex items-center justify-between p-4 border-b border-[#374151]">
          <h3 className="text-lg font-semibold text-white">API Keys</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#374151] rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-400 mb-4">
            API keys allow external systems to access Captain data. Keep your keys secure.
          </p>

          {/* Create New Key */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., POS System)"
              className="flex-1 h-10 px-4 bg-[#374151] border-none rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
            <button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim() || creating}
              className="px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>

          {/* Keys List */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No API keys yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 bg-[#374151] rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{key.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-gray-400 font-mono">
                        {showKey[key.id] ? key.api_key : `${key.api_key?.substring(0, 8)}...`}
                      </code>
                      <button
                        onClick={() => setShowKey(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                        className="text-gray-400 hover:text-white"
                      >
                        {showKey[key.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => handleCopyKey(key)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-[#4B5563] rounded"
                    >
                      {copiedKey === key.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-[#4B5563] rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Venue Settings Modal
function VenueSettingsModal({ isOpen, onClose, venue, onSave }) {
  const [settings, setSettings] = useState({
    comp_rate: 1.0,
    auto_text_enabled: true,
    waitlist_settings: {
      max_call_count: 3,
      call_timeout_minutes: 5,
      allow_remote_checkin: true
    },
    display_settings: {
      show_waitlist_count: true,
      show_game_stakes: true,
      show_player_names: false
    }
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (venue) {
      setSettings({
        comp_rate: venue.comp_rate || 1.0,
        auto_text_enabled: venue.auto_text_enabled ?? true,
        waitlist_settings: venue.waitlist_settings || settings.waitlist_settings,
        display_settings: venue.display_settings || settings.display_settings
      });
    }
  }, [venue]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/admin/venues/${venue.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        onSave?.(data.data?.venue || { ...venue, ...settings });
        onClose();
      }
    } catch (err) {
      console.error('Save venue settings error:', err);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !venue) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1F2937] rounded-xl w-full max-w-lg border border-[#374151]">
        <div className="flex items-center justify-between p-4 border-b border-[#374151]">
          <h3 className="text-lg font-semibold text-white">{venue.name} Settings</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#374151] rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Comp Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Comp Rate ($/hr)</label>
            <input
              type="number"
              step="0.25"
              value={settings.comp_rate}
              onChange={(e) => setSettings(prev => ({ ...prev, comp_rate: parseFloat(e.target.value) || 0 }))}
              className="w-full h-10 px-4 bg-[#374151] border-none rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          {/* Auto Text */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Auto Text Notifications</p>
              <p className="text-sm text-gray-400">Send automatic SMS to players when called</p>
            </div>
            <label className="relative inline-flex cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_text_enabled}
                onChange={(e) => setSettings(prev => ({ ...prev, auto_text_enabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#374151] peer-focus:ring-2 peer-focus:ring-[#1877F2] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1877F2]"></div>
            </label>
          </div>

          {/* Waitlist Settings */}
          <div className="pt-3 border-t border-[#374151]">
            <p className="font-medium text-white mb-3">Waitlist Settings</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Max Call Attempts</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.waitlist_settings?.max_call_count || 3}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    waitlist_settings: { ...prev.waitlist_settings, max_call_count: parseInt(e.target.value) || 3 }
                  }))}
                  className="w-20 h-8 px-3 bg-[#374151] border-none rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Call Timeout (minutes)</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.waitlist_settings?.call_timeout_minutes || 5}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    waitlist_settings: { ...prev.waitlist_settings, call_timeout_minutes: parseInt(e.target.value) || 5 }
                  }))}
                  className="w-20 h-8 px-3 bg-[#374151] border-none rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Allow Remote Check-in</span>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.waitlist_settings?.allow_remote_checkin ?? true}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      waitlist_settings: { ...prev.waitlist_settings, allow_remote_checkin: e.target.checked }
                    }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#374151] peer-focus:ring-2 peer-focus:ring-[#1877F2] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1877F2]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Display Settings */}
          <div className="pt-3 border-t border-[#374151]">
            <p className="font-medium text-white mb-3">Display Settings</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Show Waitlist Count Publicly</span>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.display_settings?.show_waitlist_count ?? true}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      display_settings: { ...prev.display_settings, show_waitlist_count: e.target.checked }
                    }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#374151] peer-focus:ring-2 peer-focus:ring-[#1877F2] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1877F2]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Show Game Stakes</span>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.display_settings?.show_game_stakes ?? true}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      display_settings: { ...prev.display_settings, show_game_stakes: e.target.checked }
                    }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#374151] peer-focus:ring-2 peer-focus:ring-[#1877F2] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1877F2]"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Show Player Names on Display</span>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.display_settings?.show_player_names ?? false}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      display_settings: { ...prev.display_settings, show_player_names: e.target.checked }
                    }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#374151] peer-focus:ring-2 peer-focus:ring-[#1877F2] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1877F2]"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#374151]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showVenueSettingsModal, setShowVenueSettingsModal] = useState(false);
  const [settingsVenue, setSettingsVenue] = useState(null);

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

  const handleConfigureVenue = (venue) => {
    setSettingsVenue(venue);
    setShowVenueSettingsModal(true);
  };

  const handleVenueSettingsSaved = (updatedVenue) => {
    setVenues(venues.map(v => v.id === updatedVenue.id ? { ...v, ...updatedVenue } : v));
  };

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
                  onClick={() => setShowApiKeysModal(true)}
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
                      <button
                        onClick={() => handleConfigureVenue(venue)}
                        className="text-blue-400 text-sm hover:underline"
                      >
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

      {/* Modals */}
      <ApiKeysModal
        isOpen={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
      />

      <VenueSettingsModal
        isOpen={showVenueSettingsModal}
        onClose={() => {
          setShowVenueSettingsModal(false);
          setSettingsVenue(null);
        }}
        venue={settingsVenue}
        onSave={handleVenueSettingsSaved}
      />
    </>
  );
}
