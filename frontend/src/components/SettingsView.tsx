import { useState, useEffect, useCallback } from 'react';
import { getWebhookConfig, saveWebhookConfig, regenerateWebhookSecret } from '../api';
import { friendlyError } from '../utils/friendlyError';
import { Skeleton } from './Skeleton';

function UpgradeNotice({ feature }: { feature: string }) {
  return (
    <div className="text-center py-10 text-gray-400">
      <p className="font-medium">Upgrade to unlock {feature}</p>
      <p className="text-sm mt-1">This is available on our paid plans.</p>
    </div>
  );
}

function SettingsView({ permissions }: { permissions: any }) {
  const caps = permissions?.permissions || {};
  const canWebhooks = !!caps.canAccessWebhooks;

  return (
    <div className="space-y-6">
      <NotificationsSection enabled={canWebhooks} />
    </div>
  );
}

function NotificationsSection({ enabled }: { enabled: boolean }) {
  const [notifyUrl, setNotifyUrl]     = useState('');
  const [secretKey, setSecretKey]     = useState<string | null>(null);
  const [showKey, setShowKey]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    try {
      const res = await getWebhookConfig();
      setNotifyUrl(res.data?.webhookUrl || '');
      setSecretKey(res.data?.webhookSecret || null);
    } catch {
      setError("Couldn't load your notification settings");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await saveWebhookConfig(notifyUrl.trim());
      setSecretKey(res.data?.webhookSecret || null);
      setSuccess('Saved');
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't save your notification settings"));
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("Generate a new security key? Any tool you've connected using the old key will need to be updated.")) return;
    try {
      const res = await regenerateWebhookSecret();
      setSecretKey(res.data?.webhookSecret || null);
      setSuccess('New security key generated');
    } catch {
      setError("Couldn't generate a new key");
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Instant Notifications</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Get an alert sent to your own website or app the moment an email is sent, fails, is opened, or is clicked.
        </p>
      </div>

      {!enabled ? (
        <UpgradeNotice feature="Instant Notifications" />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl text-sm">
              {success}
            </div>
          )}

          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notification URL</label>
          <div className="flex gap-2">
            <input
              value={notifyUrl}
              onChange={e => setNotifyUrl(e.target.value)}
              placeholder="https://yourwebsite.com/notifications"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {secretKey && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Security Key</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  type={showKey ? 'text' : 'password'}
                  value={secretKey}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 outline-none text-sm font-mono"
                />
                <button onClick={() => setShowKey(s => !s)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button onClick={handleRegenerate} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                  Generate New
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Use this key to confirm that notifications really came from Reachify.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SettingsView;
