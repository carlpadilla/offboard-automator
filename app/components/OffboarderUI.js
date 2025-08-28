'use client';

import { useEffect, useState, useCallback } from 'react';

export default function OffboarderUI() {
  const [userOptions, setUserOptions] = useState([]);
  // Multiple selection: array of { id: string, key: number }
  const [selectedUsers, setSelectedUsers] = useState([{ id: '', key: Date.now() }]);

  const [disableDevices, setDisableDevices] = useState(false);
  // Map of userId -> device array
  const [assignedDevices, setAssignedDevices] = useState({});
  const [loading, setLoading] = useState(false);
  const [offboardResults, setOffboardResults] = useState(null);
  const [error, setError] = useState(null);

  // -------- Load users once --------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/list-users');
        const data = await res.json();
        setUserOptions(data.users || data || []);
      } catch {
        setError('Failed to load users.');
      }
    })();
  }, []);

  // -------- Devices fetcher (single user) --------
  const fetchDevicesForUser = useCallback(async (userId) => {
    if (!userId || !disableDevices) {
      setAssignedDevices(prev => {
        const clone = { ...prev };
        delete clone[userId];
        return clone;
      });
      return;
    }
    try {
      const res = await fetch(`/api/get-user-devices?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.devices || []);
      setAssignedDevices(prev => ({ ...prev, [userId]: list }));
    } catch {
      setAssignedDevices(prev => ({ ...prev, [userId]: [] }));
    }
  }, [disableDevices]);

  // -------- When selection changes, clear results and refresh device previews --------
  useEffect(() => {
    setOffboardResults(null);
    setError(null);

    if (!disableDevices) {
      setAssignedDevices({});
      return;
    }
    // fetch for all chosen users
    selectedUsers.forEach(u => {
      if (u.id) fetchDevicesForUser(u.id);
    });
  }, [selectedUsers, fetchDevicesForUser, disableDevices]);

  // -------- If the toggle changes, refresh devices for current selections --------
  useEffect(() => {
    if (!disableDevices) {
      setAssignedDevices({});
      return;
    }
    selectedUsers.forEach(u => u.id && fetchDevicesForUser(u.id));
  }, [disableDevices, selectedUsers, fetchDevicesForUser]);

  // -------- Selection helpers --------
  const changeUserAt = (index, newId) => {
    setSelectedUsers(prev =>
      prev.map((u, i) => (i === index ? { ...u, id: newId } : u))
    );
  };

  const addUserRow = () => {
    setSelectedUsers(prev => [...prev, { id: '', key: Date.now() + Math.random() }]);
  };

  const removeUserRow = (index) => {
    setSelectedUsers(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ id: '', key: Date.now() }]; // always keep one row
    });
  };

  // -------- Submit --------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const userIds = selectedUsers.map(u => u.id).filter(Boolean);
    if (userIds.length === 0) {
      setError('Please select at least one user.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/offboard-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds,
          disableDevices,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      setOffboardResults(data.results || []);
    } catch (err) {
      setError(err.message || 'Offboarding failed.');
    } finally {
      setLoading(false);
    }
  };

  const displayName = (id) =>
    userOptions.find(u => u.id === id)?.displayName ||
    userOptions.find(u => u.id === id)?.mail ||
    userOptions.find(u => u.id === id)?.userPrincipalName ||
    id;

  return (
    <form onSubmit={handleSubmit}>
      {/* Multi user pickers */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        {selectedUsers.map((row, idx) => (
          <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={row.id}
              onChange={(e) => changeUserAt(idx, e.target.value)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 8,
                border: '1px solid #ccc',
              }}
            >
              <option value="">-- Select a user --</option>
              {userOptions.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.mail || u.userPrincipalName || u.id}
                </option>
              ))}
            </select>

            {/* Remove button (hidden when only one row) */}
            {selectedUsers.length > 1 && (
              <button
                type="button"
                onClick={() => removeUserRow(idx)}
                title="Remove"
                aria-label="Remove user row"
                style={{
                  border: '1px solid #ddd',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            )}

            {/* Add button (only on last row) */}
            {idx === selectedUsers.length - 1 && (
              <button
                type="button"
                onClick={addUserRow}
                title="Add another user"
                aria-label="Add another user"
                style={{
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Disable devices */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={disableDevices}
          onChange={e => setDisableDevices(e.target.checked)}
        />
        Disable user’s assigned devices in Entra ID
      </label>

      {/* Devices preview for each chosen user */}
      {disableDevices && (
        <div className="assigned-devices-panel">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Assigned Devices:</div>
          {selectedUsers.map(u => (
            u.id ? (
              <div key={`devices-${u.key}`} style={{ marginBottom: 6 }}>
                • {displayName(u.id)}:{' '}
                {(assignedDevices[u.id] && assignedDevices[u.id].length > 0)
                  ? assignedDevices[u.id].map(d => d.displayName || d.deviceId || d.id).join(', ')
                  : <span style={{ fontStyle: 'italic' }}>No assigned devices</span>}
              </div>
            ) : null
          ))}
          {selectedUsers.every(u => !u.id) && (
            <div style={{ fontStyle: 'italic' }}>Select users to preview devices…</div>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || selectedUsers.every(u => !u.id)}
        style={{
          width: '100%',
          padding: '14px 16px',
          border: 'none',
          borderRadius: 10,
          fontWeight: 700,
          color: '#fff',
          cursor: loading ? 'wait' : 'pointer',
          background:
            'linear-gradient(90deg, rgba(68,75,255,1) 0%, rgba(97,39,255,1) 100%)',
          boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          marginTop: 12,
        }}
      >
        {loading ? 'Offboarding…' : 'Offboard Selected Users'}
      </button>

      {/* Error */}
      {error && (
        <div
          className="results-panel"
          style={{
            background: 'var(--background)',
            color: '#f55',
            border: '1px solid rgba(255,85,85,.35)',
            borderRadius: 12,
            padding: '14px 16px',
            marginTop: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Results (clears automatically when you change any selection) */}
      {offboardResults && (
        <div className="results-panel" style={{
          background: 'var(--background)',
          color: 'var(--foreground)',
          border: '1px solid rgba(0,0,0,.08)',
          borderRadius: 12,
          padding: '16px 18px',
          marginTop: 16
        }}>
          <div style={{ color: '#22cc55', fontWeight: 700, fontSize: '1.05rem', marginBottom: 10 }}>
            Users successfully offboarded!
          </div>
          <ul>
            {offboardResults.map(res => (
              <li key={res.userId} style={{ marginBottom: 12 }}>
                <strong>{displayName(res.userId)}</strong>
                <ul style={{ marginTop: 6, paddingLeft: '1.2rem' }}>
                  {(res.actions || []).map((action, i) => (
                    <li key={i} style={{ color: action.startsWith('Error') ? '#fa4' : 'inherit' }}>
                      {action}
                    </li>
                  ))}
                  {res.removedGroups && res.removedGroups.length > 0 && (
                    <li>Removed from groups: {res.removedGroups.join(', ')}</li>
                  )}
                  {res.failedGroups && res.failedGroups.length > 0 && (
                    <li style={{ color: '#fa4' }}>
                      Failed group removals: {res.failedGroups.join(', ')}
                    </li>
                  )}
                  {res.password && (
                    <li style={{ color: '#f39c12' }}>
                      <strong>New Password (TEST):</strong> {res.password}
                    </li>
                  )}
                  {res.error && (
                    <li style={{ color: '#f44' }}>Error: {res.error}</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
