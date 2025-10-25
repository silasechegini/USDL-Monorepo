import React from "react";
import { useData } from "@udsl/react-adapter";

export default function App() {
  const { data: users, loading, error } = useData<any[]>("users");

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {String(error.message)}</div>;

  return (
    <div>
      <h1>UDSL React Demo</h1>
      <ul>
        {users?.map((u) => (
          <li key={u.id}>
            {u.name} — {u.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
