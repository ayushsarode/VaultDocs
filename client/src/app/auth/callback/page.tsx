"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/lib/api";
import Cookies from "js-cookie";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("Starting OAuth callback handling...");

        const token = searchParams.get("token");
        const userId = searchParams.get("user");

        console.log("Token:", token ? "present" : "missing");
        console.log("User ID:", userId ? "present" : "missing");

        if (!token || !userId) {
          throw new Error("Missing token or user ID in callback");
        }

        // Check if user is already logged in to prevent duplicate processing
        const existingToken = Cookies.get("token");
        if (existingToken === token) {
          console.log("User already logged in with this token, redirecting...");
          router.replace("/dashboard");
          return;
        }

        // Set the token first so the API calls work
        Cookies.set("token", token, { expires: 7 });
        console.log("Token set in cookies");

        // Get user profile data using the API utility
        console.log("Fetching user profile...");
        const userData = await authAPI.getProfile();
        console.log("User profile received:", userData);

        // Log in the user with the token and user data
        login(token, {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          picture: userData.avatar_url,
          auth_provider: "google",
        });

        console.log("User logged in, redirecting to dashboard...");
        router.replace("/dashboard");
      } catch (error: unknown) {
        console.error("Auth callback error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Authentication failed";
        setError(errorMessage);

        // Clean up any partial state
        Cookies.remove("token");
        Cookies.remove("user");

        // Redirect to login with error after a delay
        setTimeout(() => {
          router.replace(
            `/auth/login?error=${encodeURIComponent(errorMessage)}`
          );
        }, 3000);
      }
    };

    // Only run if we have search params
    if (searchParams.get("token")) {
      handleCallback();
    }
  }, [searchParams, login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <div className="text-red-600 text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900">
              Authentication Error
            </h2>
            <p className="text-gray-600">{error}</p>
            <p className="text-sm text-gray-500">
              Redirecting to login page...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* VaultDoc Logo and Branding */}
            <div className="flex flex-col items-center space-y-4">
              <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">VaultDoc</h1>
                <p className="text-gray-500">Secure Cloud Storage</p>
              </div>
            </div>

            {/* Enhanced Loading Spinner */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                {/* Outer ring */}
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200"></div>
                {/* Inner spinning part */}
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-blue-600 border-r-blue-400 absolute top-0 left-0"></div>
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-gray-700 font-medium">
                  Setting up your session...
                </p>
                <div className="flex items-center justify-center space-x-1">
                  <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce"></div>
                  <div
                    className="w-1 h-1 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-1 h-1 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
