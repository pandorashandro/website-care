import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-bold">Website Care</h1>
      <p className="text-lg">Website monitoring and optimization platform</p>
      <div className="flex gap-4">
        <Link href="/signup">Sign up</Link>
        <Link href="/login">Log in</Link>
      </div>
    </main>
  );
}
