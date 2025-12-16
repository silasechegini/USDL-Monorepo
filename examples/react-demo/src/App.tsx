import React from "react";
import { useData } from "@udsl/react-adapter";

export default function App() {
  /**
   * It's highly recommended that the data expected be specified. Avoid using type any.
   */
  const { data: users, loading, error } = useData<any[]>("users");

  /**
   * Ideally, loading and error will be handled more elegantly.
   * perhaps, separated into components. this is just an example component.
   */
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {String(error.message)}</div>;

  return (
    <div>
      <h1>UDSL React Demo</h1>

      {/* Telemetry Status Indicator */}
      <div
        style={{
          padding: "10px",
          marginBottom: "20px",
          backgroundColor: "#e8f5e9",
          border: "1px solid #4caf50",
          borderRadius: "4px",
        }}>
        <strong>Telemetry Active</strong>
        <p style={{ margin: "5px 0 0 0", fontSize: "14px", color: "#555" }}>
          Open your browser's DevTools console to see OpenTelemetry spans being
          traced. Each API call, cache operation, and revalidation creates
          telemetry data.
        </p>
      </div>

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
