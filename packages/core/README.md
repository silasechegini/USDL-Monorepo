You can easily design UDSL to be reactive without re-rendering the tree.

Here’s how:

Option 1 — Keep UDSL instance stable and self-contained

Let UDSL manage its internal state (cache, mutations, subscribers) outside React.
Expose reactive data via hooks that subscribe to it.

// in @udsl/core
type Listener = () => void;

export class UDSL {
private listeners: Set<Listener> = new Set();
private cache = new Map<string, any>();

subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
notify() { for (const fn of this.listeners) fn(); }

async get(resource: string) {
if (this.cache.has(resource)) return this.cache.get(resource);
const res = await fetch(resource).then(r => r.json());
this.cache.set(resource, res);
this.notify();
return res;
}
}

// Then in your hook
export function useData(resource: string) {
const udsl = useUDSL();
const [data, setData] = useState(() => udsl.cache.get(resource));

useEffect(() => {
const unsubscribe = udsl.subscribe(() => {
setData(udsl.cache.get(resource));
});
udsl.get(resource).then(setData);
return unsubscribe;
}, [resource, udsl]);

return data;
}

Option 2 — Split context values (if needed)

If you later want to expose both:

A stable UDSL instance, and

A dynamic state (like current environment, user, etc.)

You can split contexts:

<UDSLInstanceProvider value={udsl}>
  <UDSLConfigProvider value={envConfig}>
    <App />
  </UDSLConfigProvider>
</UDSLInstanceProvider>

This limits re-renders to subtrees that actually depend on changing data.

Option 3 — Memoize your context value

Even if you do have to reassign values dynamically, wrap them in useMemo:

<UDSLContext.Provider value={useMemo(() => udsl, [udsl])}>
{children}
</UDSLContext.Provider>

This prevents React from treating it as a new object every render.
