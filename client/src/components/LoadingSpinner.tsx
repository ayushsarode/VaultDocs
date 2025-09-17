import React from "react";

interface LoadingSpinnerProps {
  text?: string;
  variant?: "fullscreen" | "content";
}

export default function LoadingSpinner({
  text,
  variant = "content",
}: LoadingSpinnerProps) {
  if (variant === "fullscreen") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            {/* Outer ring */}
            <div className="w-16 h-16 border-4 border-blue-100 rounded-full animate-spin"></div>
            {/* Inner spinning ring */}
            <div className="w-16 h-16 border-4 border-blue-600 rounded-full animate-spin absolute top-0 left-0 border-t-transparent border-r-transparent"></div>
            {/* Center dot */}
            <div className="w-2 h-2 bg-blue-600 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
          {text && (
            <div className="text-center">
              <p className="text-gray-600 font-medium">{text}</p>
              <p className="text-gray-400 text-sm mt-1">Please wait...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: content variant
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          {/* Outer ring */}
          <div className="w-12 h-12 border-3 border-blue-100 rounded-full animate-spin"></div>
          {/* Inner spinning ring */}
          <div className="w-12 h-12 border-3 border-blue-600 rounded-full animate-spin absolute top-0 left-0 border-t-transparent border-r-transparent"></div>
          {/* Center dot */}
          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>
        {text && (
          <div className="text-center">
            <p className="text-gray-600 font-medium text-sm">{text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
