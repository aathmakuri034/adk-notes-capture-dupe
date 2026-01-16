"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loginAction } from "./actions";

const initialState = { error: "", success: false };

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      router.push("/");
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-4 text-center text-black">Login</h1>

        {state?.error && (
          <p className="text-red-500 text-center mb-3 font-medium">
            {state.error}
          </p>
        )}

        <form action={formAction} className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            className="w-full p-2 border rounded focus:ring focus:ring-blue-300 text-black"
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            className="w-full p-2 border rounded focus:ring focus:ring-blue-300 text-black"
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
