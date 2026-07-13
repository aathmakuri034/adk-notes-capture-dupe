// app/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

export default function SignupPage() {
  // SUPABASE-DISABLED-DEMO: signup form is disabled for the demo. A placeholder
  // is rendered instead. Original component body preserved below.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-200 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
          Signup Disabled
        </h1>
        <p className="text-gray-600 mb-4">
          Authentication is turned off in this demo build.
        </p>
        <a
          href="/"
          className="inline-block py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-md"
        >
          Continue to app →
        </a>
      </div>
    </div>
  );

  /* SUPABASE-DISABLED-DEMO
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg("Account created! You can now log in.");
    setTimeout(() => router.push("/login"), 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-200">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
          Create an Account
        </h1>

        {errorMsg && (
          <p className="mb-4 text-red-500 text-center">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="mb-4 text-green-600 text-center">{successMsg}</p>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
              placeholder="Choose a password"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-md"
          >
            Sign Up
          </button>
        </form>

        <p className="mt-6 text-center text-gray-600 text-sm">
          Already have an account?{" "}
          <a href="/login" className="text-indigo-600 hover:underline font-medium">
            Login
          </a>
        </p>
      </div>
    </div>
  );
  */
}
