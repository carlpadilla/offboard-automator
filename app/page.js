"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react"; // For a stylish plus icon, needs lucide-react

export default function Home() {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState([]);

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

  const handleOffboard = async () => {
    setLoading(true);
    setMessage("");
    setSteps([]);
    // Remove empty or duplicate user IDs
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
        body: JSON.stringify({ userIds }),
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
                {users
                  .filter(
                    (user) =>
                      // Allow the same user in multiple dropdowns for flexibility,
                      // or uncomment the next line to prevent duplicates:
                      // !selectedUsers.includes(user.id) || user.id === selectedUser
                      true
                  )
                  .map((user) => (
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
