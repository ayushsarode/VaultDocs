import React from "react";

interface LoadingSpinnerProps {
  text?: string;
  variant?: "fullscreen" | "content";
}

export function LoadingSpinner({
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

// Page Loading Skeleton Components
export function PageLoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div className="flex items-center space-x-4">
          <div>
            <div className="h-8 bg-gray-200 rounded-lg w-32 animate-pulse mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
          </div>
        </div>
        <div className="flex items-center space-x-3 overflow-x-auto">
          <div className="h-10 bg-gray-200 rounded-lg w-20 animate-pulse flex-shrink-0"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-16 animate-pulse flex-shrink-0"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-16 animate-pulse flex-shrink-0"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-24 animate-pulse flex-shrink-0"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-20 animate-pulse flex-shrink-0"></div>
        </div>
      </div>

      {/* Search Skeleton */}
      <div className="relative max-w-md">
        <div className="h-10 bg-gray-200 rounded-lg w-full animate-pulse"></div>
      </div>

      {/* Content Skeleton */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="divide-y divide-gray-100">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="flex items-center p-4 space-x-4">
              <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
