import React from "react";
import { useData } from "@udsl/react-adapter";

export default function App() {
  /** 
  * It's highly recommended that the data expected be specified. Avoid using type any.
  */
  const { data: users, loading, error } = useData<any[]>("users");

  /**
  * Ideally, loading and error will be handled more elegantly. 
  * perhaps, seperated into components. this is just an example component.
  */
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

