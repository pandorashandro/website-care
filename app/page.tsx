import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("test_connection")
    .select("*");

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Supabase Connection Test</h1>

      {error ? (
        <div>
          <p>Supabase is connected, but our test table doesn't exist yet.</p>
          <p>That's okay! We'll create our database next.</p>
          <pre>{error.message}</pre>
        </div>
      ) : (
        <div>
          <p>🎉 Supabase connection works!</p>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}