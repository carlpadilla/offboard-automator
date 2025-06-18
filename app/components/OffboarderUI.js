'use client';

import { useState, useEffect } from "react";

export default function OffboarderUI() {
  const [userOptions, setUserOptions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([{ userId: "", id: Date.now() }]);
  const [disableDevices, setDisableDevices] = useState(false);
  const [assignedDevices, setAssignedDevices] = useState({});
  const [loading, setLoading] = useState(false);
  const [offboardResults, setOffboardResults] = useState(null);
  const [error, setError] = useState(null);

  // Fetch users from backend API
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/list-users/");
        const data = await res.json();
        setUserOptions(data.users || data || []);
      } catch (err) {
        setError("Failed to fetch users.");
      }
    };
    fetchUsers();
  }, []);

  // Fetch assigned devices for selected users
  useEffect(() => {
    const fetchDevices = async () => {
      const devices = {};
      for (const entry of selectedUsers) {
        if (entry.userId) {
          try {
            const res = await fetch(`/api/get-user-devices?userId=${entry.userId}`);
            const data = await res.json();
            devices[entry.userId] = data.devices || data || [];
          } catch {
            devices[entry.userId] = [];
          }
        }
      }
      setAssignedDevices(devices);
    };
    if (disableDevices) fetchDevices();
    else setAssignedDevices({});
    // eslint-disable-next-line
  }, [selectedUsers, disableDevices]);

  const handleUserChange = (idx, userId) => {
    setSelectedUsers(prev =>
      prev.map((u, i) => (i === idx ? { ...u, userId } : u))
    );
  };

  const addUser = () => {
    setSelectedUsers(prev => [...prev, { userId: "", id: Date.now() }]);
  };

  const removeUser = (idx) => {
    setSelectedUsers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setOffboardResults(null);
    setError(null);

    const userIds = selectedUsers.map(u => u.userId).filter(Boolean);
    if (userIds.length === 0) {
      setError("Please select at least one user.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/offboard-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, disableDevices })
      });
      const data = await res.json();
      setOffboardResults(data.results || []);
    } catch (err) {
      setError("Offboarding failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: "2em" }}>
        {selectedUsers.map((entry, idx) => (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", marginBottom: "1em" }}>
            <select
              value={entry.userId}
              onChange={e => handleUserChange(idx, e.target.value)}
              style={{
                width: "260px",
                padding: "0.6em",
                borderRadius: "6px",
                marginRight: "0.5em",
                fontSize: "1em"
              }}
              required
            >
              <option value="">-- Select a user --</option>
              {userOptions.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.mail || u.userPrincipalName || u.id}
                </option>
              ))}
            </select>
            {selectedUsers.length > 1 && (
              <button
                type="button"
                onClick={() => removeUser(idx)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#e77",
                  fontWeight: "bold",
                  fontSize: "1.5em",
                  cursor: "pointer",
                  marginRight: "0.4em"
                }}
                title="Remove user"
              >
                ×
              </button>
            )}
            {idx === selectedUsers.length - 1 && (
              <button
                type="button"
                onClick={addUser}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1.3em",
                  padding: "0.1em 0.55em",
                  cursor: "pointer",
                  marginLeft: "0.1em"
                }}
                title="Add another user"
              >
                +
              </button>
            )}
          </div>
        ))}

        <div style={{ margin: "1em 0" }}>
          <label style={{ display: "flex", alignItems: "center", fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={disableDevices}
              onChange={e => setDisableDevices(e.target.checked)}
              style={{ marginRight: "0.7em" }}
            />
            Disable user’s assigned devices in Entra ID
          </label>
        </div>

        {disableDevices && (
          <div className="assigned-devices-panel">
            <div style={{ fontWeight: 600, marginBottom: "0.3em" }}>Assigned Devices:</div>
            {selectedUsers.map(entry => {
              const user = userOptions.find(u => u.id === entry.userId);
              const userDevices = assignedDevices[entry.userId] || [];
              return entry.userId ? (
                <div key={entry.userId} style={{ fontSize: "1em", marginLeft: "1em", marginBottom: "0.3em" }}>
                  • {user?.displayName || entry.userId}:{" "}
                  {userDevices.length > 0
                    ? userDevices.map(d => d.displayName || d.id).join(", ")
                    : <span style={{ fontStyle: "italic", color: "#aaa" }}>No assigned devices</span>}
                </div>
              ) : null;
            })}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? "#444" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "1.1em",
            padding: "1em",
            fontWeight: 600,
            marginTop: "0.7em",
            cursor: loading ? "wait" : "pointer",
            boxShadow: "0 2px 10px #0002"
          }}
        >
          {loading ? "Offboarding..." : "Offboard Selected Users"}
        </button>
      </form>

      {error && (
        <div style={{
          background: "#7a2b27",
          color: "#fff",
          padding: "1em",
          borderRadius: "8px",
          marginBottom: "1em"
        }}>
          {error}
        </div>
      )}

    {offboardResults && (
      <div className="results-panel">
        <div style={{ color: "#22cc55", fontWeight: 700, fontSize: "1.1em", marginBottom: "1em" }}>
          Users successfully offboarded!
        </div>
        <ul>
          {offboardResults.map(res => (
            <li key={res.userId} style={{ color: "inherit", marginBottom: "1em" }}>
              <strong>
                {userOptions.find(u => u.id === res.userId)?.displayName || res.userId}:
              </strong>
              <ul style={{ margin: "0.5em 0 0 1.2em" }}>
                {(res.actions || []).map((action, i) => (
                  <li key={i} style={{ color: action.startsWith("Error") ? "#fa4" : "inherit" }}>
                    {action}
                  </li>
                ))}
                {/* SHOW PASSWORD FOR TESTING ONLY */}
                {res.password && (
                  <li>
                    <strong style={{ color: "#d09e26" }}>New Password (TEST):</strong>
                    <span style={{ fontFamily: "monospace", marginLeft: "0.5em" }}>{res.password}</span>
                  </li>
                )}
                {res.error && (
                  <li style={{ color: "#f44" }}>Error: {res.error}</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    )}


    </div>
  );
}
