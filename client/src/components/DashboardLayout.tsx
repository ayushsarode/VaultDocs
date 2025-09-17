"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/lib/api";
import {
  Cloud,
  FolderOpen,
  Upload,
  LogOut,
  Menu,
  X,
  User,
  Grid3X3,
  Star,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px) for a swipe to register
  const minSwipeDistance = 50;

  useEffect(() => {
    const mainElement = document.querySelector("main[data-scroll-container]");
    if (!mainElement) return;

    const handleScroll = () => setScrollY(mainElement.scrollTop);
    mainElement.addEventListener("scroll", handleScroll);
    return () => mainElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Close sidebar when screen becomes large
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isSidebarOpen]);

  const handleLogout = () => {
    authAPI.logout();
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Handle touch events for swipe gestures
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Close sidebar on left swipe, open on right swipe from edge
    if (isLeftSwipe && isSidebarOpen) {
      setIsSidebarOpen(false);
    } else if (isRightSwipe && !isSidebarOpen && touchStart < 50) {
      setIsSidebarOpen(true);
    }
  };

  // Calculate opacity based on scroll position (fade out after 100px)
  const welcomeOpacity = Math.max(0, 1 - scrollY / 100);

  return (
    <div
      className="h-screen flex bg-gray-50 touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Sidebar */}
      <div
        className={`bg-white shadow-sm border-r border-gray-100 transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col w-64 fixed inset-y-0 left-0 z-50`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-100">
          <div className="flex items-center">
            <div className="p-2 bg-black rounded-xl">
              <Cloud className="h-5 w-5 text-white" />
            </div>
            <span className="ml-3 text-xl font-extralight text-gray-900">
              Vault
            </span>
            <span className="font-medium  text-gray-900 text-xl">Docs</span>
          </div>

          {/* Close button for mobile */}
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User info */}
        <div className="p-4 lg:p-6 border-b border-gray-100">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="h-4 w-4 lg:h-5 lg:w-5 text-gray-600" />
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name || user?.email || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 flex flex-col pt-2 pb-4 overflow-y-auto">
          <nav className="flex-1 px-4 lg:px-6 space-y-1">
            <a
              href="/dashboard"
              className="text-gray-700 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-3 lg:py-3 text-sm font-medium rounded-xl transition-colors touch-manipulation"
              onClick={() => setIsSidebarOpen(false)}
            >
              <Grid3X3 className="text-gray-400 group-hover:text-gray-600 mr-3 h-5 w-5 flex-shrink-0" />
              Dashboard
            </a>
            <a
              href="/dashboard/files"
              className="text-gray-700 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-3 lg:py-3 text-sm font-medium rounded-xl transition-colors touch-manipulation"
              onClick={() => setIsSidebarOpen(false)}
            >
              <FolderOpen className="text-gray-400 group-hover:text-gray-600 mr-3 h-5 w-5 flex-shrink-0" />
              My Files
            </a>
            <a
              href="/dashboard/upload"
              className="text-gray-700 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-3 lg:py-3 text-sm font-medium rounded-xl transition-colors touch-manipulation"
              onClick={() => setIsSidebarOpen(false)}
            >
              <Upload className="text-gray-400 group-hover:text-gray-600 mr-3 h-5 w-5 flex-shrink-0" />
              Upload
            </a>

            <div className="pt-4 lg:pt-6 pb-2">
              <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                Quick Access
              </p>
            </div>

            <a
              href="/dashboard/starred"
              className="text-gray-700 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-3 lg:py-3 text-sm font-medium rounded-xl transition-colors touch-manipulation"
              onClick={() => setIsSidebarOpen(false)}
            >
              <Star className="text-gray-400 group-hover:text-gray-600 mr-3 h-5 w-5 flex-shrink-0" />
              Starred
            </a>

            <div className="pt-4 lg:pt-6 pb-2">
              <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                Account
              </p>
            </div>

            <a
              href="/dashboard/profile"
              className="text-gray-700 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-3 py-3 lg:py-3 text-sm font-medium rounded-xl transition-colors touch-manipulation"
              onClick={() => setIsSidebarOpen(false)}
            >
              <User className="text-gray-400 group-hover:text-gray-600 mr-3 h-5 w-5 flex-shrink-0" />
              Profile
            </a>
          </nav>
        </div>

        {/* Logout button */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 lg:p-6">
          <button
            onClick={() => {
              handleLogout();
              setIsSidebarOpen(false);
            }}
            className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 w-full px-3 py-3 lg:py-3 rounded-xl transition-colors touch-manipulation"
          >
            <LogOut className="text-gray-400 mr-3 h-5 w-5 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
            onClick={toggleSidebar}
            style={{ touchAction: "none" }}
          ></div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <div className="flex items-center space-x-3">
              <button
                type="button"
                className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 touch-manipulation"
                onClick={toggleSidebar}
              >
                <span className="sr-only">Open sidebar</span>
                <Menu className="h-5 w-5" />
              </button>

              {/* Mobile logo - only show when sidebar is closed */}
              <div className="lg:hidden flex items-center">
                <div className="p-1.5 bg-black rounded-lg">
                  <Cloud className="h-4 w-4 text-white" />
                </div>
                <span className="ml-2 text-lg font-extralight text-gray-900">
                  Vault
                </span>
                <span className="font-medium text-gray-900 text-lg">Docs</span>
              </div>
            </div>

            {/* Welcome message */}
            <div className="flex-1   lg:mr-6">
              <div
                style={{ opacity: welcomeOpacity }}
                className="transition-opacity duration-300"
              >
                <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-light text-gray-900 truncate">
                  <span className="hidden sm:inline">Hello👋, </span>
                  <span className="hidden sm:inline">
                    {user?.name?.split(" ")[0] ||
                      user?.email?.split("@")[0] ||
                      "User"}
                    !
                  </span>
                </h1>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4">
              {/* Quick upload button */}
              <a
                href="/dashboard/upload"
                className="inline-flex items-center px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 bg-black text-white text-xs sm:text-sm font-medium rounded-lg lg:rounded-xl hover:bg-gray-800 transition-colors touch-manipulation"
              >
                <Upload className="h-3 w-3 sm:h-4 sm:w-4 lg:mr-2" />
                <span className="hidden sm:inline ml-1 lg:ml-0">Upload</span>
              </a>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main
          className="flex-1 relative overflow-y-auto bg-gray-50 pb-16 sm:pb-0"
          data-scroll-container
        >
          {children}
        </main>

        {/* Bottom navigation for mobile */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
          <div className="flex items-center justify-around">
            <a
              href="/dashboard"
              className="flex flex-col items-center p-2 text-gray-500 hover:text-gray-900 transition-colors touch-manipulation"
            >
              <Grid3X3 className="h-5 w-5 mb-1" />
              <span className="text-xs">Dashboard</span>
            </a>
            <a
              href="/dashboard/files"
              className="flex flex-col items-center p-2 text-gray-500 hover:text-gray-900 transition-colors touch-manipulation"
            >
              <FolderOpen className="h-5 w-5 mb-1" />
              <span className="text-xs">Files</span>
            </a>
            <a
              href="/dashboard/upload"
              className="flex flex-col items-center p-2 text-white bg-black rounded-xl transition-colors touch-manipulation"
            >
              <Upload className="h-5 w-5 mb-1" />
              <span className="text-xs">Upload</span>
            </a>
            <a
              href="/dashboard/starred"
              className="flex flex-col items-center p-2 text-gray-500 hover:text-gray-900 transition-colors touch-manipulation"
            >
              <Star className="h-5 w-5 mb-1" />
              <span className="text-xs">Starred</span>
            </a>
            <button
              onClick={toggleSidebar}
              className="flex flex-col items-center p-2 text-gray-500 hover:text-gray-900 transition-colors touch-manipulation"
            >
              <Menu className="h-5 w-5 mb-1" />
              <span className="text-xs">More</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
