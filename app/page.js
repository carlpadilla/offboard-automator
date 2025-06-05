"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

export default function Home() {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState([]);
  const [disableDevices, setDisableDevices] = useState(false);
  const [userDevices, setUserDevices] = useState({});

  useEffect(() => {
    fetch("/api/list-users")
      .then((res) => res.json())
      .then((data) => setUsers(data));
  }, []);

  const handleUserChange = (index, value) => {
    const updated = [...selectedUsers];
    updated[index] = value;
    setSelectedUsers(updated);
  };

  const addDropdown = () => {
    setSelectedUsers([...selectedUsers, ""]);
  };

  const removeDropdown = (index) => {
    const updated = selectedUsers.filter((_, i) => i !== index);
    setSelectedUsers(updated);
  };

  useEffect(() => {
    if (!disableDevices) {
      setUserDevices({});
      return;
    }
    const fetchUserDevices = async () => {
      let devicesByUser = {};
      for (const userId of selectedUsers.filter(Boolean)) {
        const res = await fetch(`/api/get-user-devices?userId=${userId}`);
        const data = await res.json();
        devicesByUser[userId] = Array.isArray(data) ? data : [];
      }
      setUserDevices(devicesByUser);
    };
    if (selectedUsers.filter(Boolean).length > 0) {
      fetchUserDevices();
    }
  }, [selectedUsers, disableDevices]);

  const handleOffboard = async () => {
    setLoading(true);
    setMessage("");
    setSteps([]);
    const userIds = [...new Set(selectedUsers.filter((id) => !!id))];
    if (userIds.length === 0) {
      setMessage("Please select at least one user.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/offboard-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, disableDevices }),
      });
      const data = await response.json();
      if (data.success) {
        setMessage("Users successfully offboarded!");
        setSteps(data.results || []);
      } else {
        setMessage(data.error || "An error occurred.");
        setSteps([]);
      }
    } catch (err) {
      setMessage("Network error. Please try again.");
      setSteps([]);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="max-w-md w-full p-8 bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-800">
        <h1 className="text-2xl font-bold mb-4 text-center text-white">Offboard Users</h1>
        <div className="flex flex-col gap-4">
          {selectedUsers.map((selectedUser, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select
                className="flex-1 p-2 rounded bg-neutral-800 text-white border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={selectedUser}
                onChange={(e) => handleUserChange(idx, e.target.value)}
              >
                <option value="" disabled>
                  -- Select a user --
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                    {user.mail ? ` (${user.mail})` : ""}
                  </option>
                ))}
              </select>
              {selectedUsers.length > 1 && (
                <button
                  className="px-2 py-1 text-red-400 hover:text-red-600 rounded"
                  onClick={() => removeDropdown(idx)}
                  aria-label="Remove"
                  type="button"
                >
                  ×
                </button>
              )}
              {idx === selectedUsers.length - 1 && (
                <button
                  className="p-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition"
                  onClick={addDropdown}
                  aria-label="Add another user"
                  type="button"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center mt-4 mb-2">
          <input
            type="checkbox"
            id="disable-devices"
            checked={disableDevices}
            onChange={(e) => setDisableDevices(e.target.checked)}
            className="mr-2 accent-blue-600"
          />
          <label htmlFor="disable-devices" className="text-gray-200 text-sm">
            Disable user’s assigned devices in Entra ID
          </label>
        </div>
        {disableDevices &&
          selectedUsers.filter(Boolean).length > 0 && (
            <div className="mb-4">
              <h3 className="text-white text-md font-semibold">Assigned Devices:</h3>
              <ul className="text-sm text-gray-300 list-disc pl-5">
                {selectedUsers.filter(Boolean).map((userId) => (
                  <li key={userId}>
                    <span className="font-medium">
                      {users.find((u) => u.id === userId)?.displayName || userId}:
                    </span>{" "}
                    {userDevices[userId] && userDevices[userId].length > 0 ? (
                      userDevices[userId]
                        .map((dev) => dev.displayName || dev.id)
                        .join(", ")
                    ) : (
                      <span className="text-gray-400 italic">No assigned devices</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        <button
          disabled={selectedUsers.filter(Boolean).length === 0 || loading}
          onClick={handleOffboard}
          className={`w-full py-2 mt-6 rounded font-semibold transition ${
            selectedUsers.filter(Boolean).length > 0 && !loading
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Offboarding..." : "Offboard Selected Users"}
        </button>
        {message && (
          <div className="mt-4 text-center text-lg text-green-400">{message}</div>
        )}
        {steps.length > 0 && (
          <ul className="mt-4 text-left text-sm text-gray-200 list-disc pl-5">
            {steps.map((result, i) => (
              <li key={i}>
                <span className="font-semibold">{result.displayName}:</span>
                <ul className="list-disc pl-4">
                  {result.actions.map((action, j) => (
                    <li key={j}>{action}</li>
                  ))}
                  {result.password && (
                    <li>
                      <span className="text-yellow-300 font-mono">
                        New Password: {result.password}
                      </span>
                    </li>
                  )}
                  {result.error && (
                    <li className="text-red-400">Error: {result.error}</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
// This code is a Next.js client component that allows users to offboard multiple users from an Azure AD tenant.
// It fetches the list of users from an API, allows selection of users, and performs offboarding actions such as disabling accounts, revoking sessions, updating company names, and resetting passwords.
// The component also optionally disables assigned devices in Entra ID and displays the results of the offboarding process, including any errors encountered.