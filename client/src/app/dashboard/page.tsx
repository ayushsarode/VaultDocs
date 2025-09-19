"use client";

import React, { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import LoadingSpinner from "@/components/LoadingSpinner";
import { storageAPI, folderAPI, fileAPI } from "@/lib/api";
import {
  Folder,
  File,
  Upload,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Share2,
  Star,
} from "lucide-react";

interface StorageInfo {
  used_space: number;
  max_space: number;
  file_count: number;
  folder_count: number;
}

interface DashboardFile {
  id: string;
  name: string;
  original_name: string;
  size: number;
  content_type: string;
  url: string;
  created_at: string;
  folder_id?: string;
  is_favorite?: boolean;
}

export default function DashboardPage() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [recentFiles, setRecentFiles] = useState<DashboardFile[]>([]);
  const [allFiles, setAllFiles] = useState<DashboardFile[]>([]); // Store all files for counting
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const fetchAllFilesRecursively = async () => {
    try {
      const allFiles = [];

      // First get all files from root folder
      const rootFiles = await fileAPI.getAll();
      allFiles.push(...rootFiles);

      // Then get all folders recursively and fetch files from each
      const fetchFilesFromFolders = async (parentId?: string) => {
        const folders = await folderAPI.getAll(parentId);

        for (const folder of folders) {
          // Get files from this folder
          const folderFiles = await fileAPI.getAll(folder.id);
          allFiles.push(...folderFiles);

          // Recursively fetch from subfolders
          await fetchFilesFromFolders(folder.id);
        }
      };

      await fetchFilesFromFolders();
      return allFiles;
    } catch (error) {
      console.error("Error fetching all files recursively:", error);
      return [];
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      const timeoutId = setTimeout(() => {
        setError("Loading timeout - using default values");
        setLoading(false);
      }, 20000);

      try {
        setError(null);

        // Set default storage info first
        const defaultStorage = {
          used_space: 0,
          max_space: 2147483648,
          file_count: 0,
          folder_count: 0,
        };
        setStorageInfo(defaultStorage);

        // Try to fetch actual storage data
        try {
          const storage = await storageAPI.getInfo();

          // More robust validation and normalization
          if (storage && typeof storage === "object") {
            const normalizedStorage = {
              used_space: (() => {
                const value = Number(storage.used_space);
                if (isNaN(value) || value < 0) return 0;
                return value;
              })(),
              max_space: (() => {
                const value = Number(storage.max_space);
                return isNaN(value) || value <= 0 ? 2147483648 : value; // 2GB default
              })(),
              file_count: (() => {
                const value = Number(storage.file_count);
                return isNaN(value) || value < 0 ? 0 : value;
              })(),
              folder_count: (() => {
                const value = Number(storage.folder_count);
                return isNaN(value) || value < 0 ? 0 : value;
              })(),
            };

            setStorageInfo(normalizedStorage);
          } else {
            console.warn(
              "Invalid storage data structure received, using defaults:",
              storage
            );
          }
        } catch (storageError) {
          console.error("Storage API failed:", storageError);
        }

        // Fetch files
        try {
          const allFilesArray = await fetchAllFilesRecursively();
          setAllFiles(allFilesArray);

          const rootFiles = await fileAPI.getAll();
          setRecentFiles(rootFiles.slice(0, 8));
        } catch (filesError) {
          console.error("Files API failed:", filesError);
          setRecentFiles([]);
          setAllFiles([]);
        }

        clearTimeout(timeoutId);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setError("Failed to load dashboard data");
        setRecentFiles([]);
        setAllFiles([]);
        setStorageInfo({
          used_space: 0,
          max_space: 2147483648,
          file_count: 0,
          folder_count: 0,
        });
        clearTimeout(timeoutId);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatFileSize = (bytes: number | undefined | null) => {
    // Handle undefined, null, NaN, or negative values
    if (
      bytes === undefined ||
      bytes === null ||
      isNaN(Number(bytes)) ||
      Number(bytes) < 0
    ) {
      return "0 Bytes";
    }

    const numBytes = Number(bytes);
    if (numBytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    const sizeIndex = Math.min(i, sizes.length - 1); // Prevent array out of bounds

    const formattedSize = parseFloat(
      (numBytes / Math.pow(k, sizeIndex)).toFixed(2)
    );
    return formattedSize + " " + sizes[sizeIndex];
  };

  const getStoragePercentage = () => {
    if (
      !storageInfo ||
      typeof storageInfo.used_space !== "number" ||
      typeof storageInfo.max_space !== "number" ||
      isNaN(storageInfo.used_space) ||
      isNaN(storageInfo.max_space) ||
      storageInfo.max_space <= 0
    ) {
      return 0;
    }
    const percentage = (storageInfo.used_space / storageInfo.max_space) * 100;
    return Math.min(Math.max(percentage, 0), 100); // Ensure between 0-100
  };

  const getFileIcon = (contentType: string) => {
    if (contentType?.includes("image"))
      return (
        <Image className="h-5 w-5 text-blue-500" aria-label="Image file" />
      );
    if (contentType?.includes("video"))
      return <Video className="h-5 w-5 text-red-500" />;
    if (contentType?.includes("audio"))
      return <Music className="h-5 w-5 text-green-500" />;
    if (contentType?.includes("pdf") || contentType?.includes("document"))
      return <FileText className="h-5 w-5 text-orange-500" />;
    if (contentType?.includes("zip") || contentType?.includes("archive"))
      return <Archive className="h-5 w-5 text-purple-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const getFilesByType = (type: string) => {
    if (type === "all") return recentFiles;
    return recentFiles.filter((file) => {
      const contentType = file.content_type?.toLowerCase() || "";
      switch (type) {
        case "images":
          return contentType.includes("image");
        case "videos":
          return contentType.includes("video");
        case "documents":
          return (
            contentType.includes("pdf") ||
            contentType.includes("document") ||
            contentType.includes("text")
          );
        case "audio":
          return contentType.includes("audio");
        default:
          return true;
      }
    });
  };

  const getFileTypeStats = () => {
    // Use ALL files (including subfolders) for counting
    const images = allFiles.filter((f) =>
      f.content_type?.includes("image")
    ).length;
    const videos = allFiles.filter((f) =>
      f.content_type?.includes("video")
    ).length;
    const documents = allFiles.filter(
      (f) =>
        f.content_type?.includes("pdf") ||
        f.content_type?.includes("document") ||
        f.content_type?.includes("text")
    ).length;
    const audio = allFiles.filter((f) =>
      f.content_type?.includes("audio")
    ).length;
    const other = allFiles.length - images - videos - documents - audio;

    return { images, videos, documents, audio, other };
  };

  const handleFileClick = async (file: DashboardFile) => {
    try {
      const response = await fileAPI.download(file.id);

      if (response.method === "proxy") {
        // For proxy downloads, create a blob URL and open it
        const link = document.createElement("a");
        link.href = response.download_url;

        // Check if it's an image, PDF, or other viewable content
        if (
          file.content_type?.includes("image") ||
          file.content_type?.includes("pdf") ||
          file.content_type?.includes("text")
        ) {
          // Open in new tab for viewing
          link.target = "_blank";
          link.click();
        } else {
          // Download the file
          link.download = file.original_name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Clean up blob URL
        setTimeout(
          () => window.URL.revokeObjectURL(response.download_url),
          100
        );
      } else {
        // For signed URLs, open in new tab
        window.open(response.download_url, "_blank");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      alert("Failed to open file. Please try again.");
    }
  };

  const handleToggleFavorite = async (
    fileId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation(); // Prevent file click when clicking star
    try {
      await fileAPI.toggleFavorite(fileId);

      // Update the files in state
      setRecentFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? { ...file, is_favorite: !file.is_favorite }
            : file
        )
      );

      setAllFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? { ...file, is_favorite: !file.is_favorite }
            : file
        )
      );
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to update favorite status. Please try again.");
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <LoadingSpinner
            variant="fullscreen"
            text="Loading your dashboard..."
          />
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-8 space-y-8 bg-white min-h-screen">
          {error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-medium text-gray-900 mb-1">
                    Storage
                  </h2>
                  <p className="text-gray-600 text-sm">
                    {formatFileSize(storageInfo?.used_space)} of{" "}
                    {formatFileSize(storageInfo?.max_space || 2147483648)} used
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light text-gray-900 mb-1">
                    {(() => {
                      const percentage = getStoragePercentage();
                      return isNaN(percentage) ? "0.0" : percentage.toFixed(1);
                    })()}
                    %
                  </div>
                  <div className="text-gray-500 text-xs">Storage used</div>
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${(() => {
                      const percentage = getStoragePercentage();
                      return isNaN(percentage) ? 0 : percentage;
                    })()}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              {
                key: "all",
                icon: File,
                label: "All files",
                count: allFiles.length,
                color: "bg-gray-100 text-gray-700",
              },
              {
                key: "images",
                icon: Image,
                label: "Images",
                count: getFileTypeStats().images,
                color: "bg-blue-50 text-blue-600",
              },
              {
                key: "videos",
                icon: Video,
                label: "Videos",
                count: getFileTypeStats().videos,
                color: "bg-red-50 text-red-600",
              },
              {
                key: "documents",
                icon: FileText,
                label: "Documents",
                count: getFileTypeStats().documents,
                color: "bg-orange-50 text-orange-600",
              },
              {
                key: "audio",
                icon: Music,
                label: "Audio",
                count: getFileTypeStats().audio,
                color: "bg-green-50 text-green-600",
              },
            ].map((category) => (
              <button
                key={category.key}
                onClick={() => setActiveFilter(category.key)}
                className={`p-6 rounded-2xl border border-gray-200 transition-all hover:shadow-md ${
                  activeFilter === category.key
                    ? `${category.color} shadow-sm border-2`
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex flex-col items-center space-y-3">
                  <div className={`p-3 rounded-xl ${category.color}`}>
                    <category.icon className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-light text-gray-900 mb-1">
                      {category.count}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">
                      {category.label}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-8 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-medium text-gray-900 mb-1">
                    {activeFilter === "all"
                      ? "Recent files"
                      : `${
                          activeFilter.charAt(0).toUpperCase() +
                          activeFilter.slice(1)
                        }`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {getFilesByType(activeFilter).length} file
                    {getFilesByType(activeFilter).length !== 1 ? "s" : ""}
                  </p>
                </div>
                <a
                  href="/dashboard/files"
                  className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                >
                  View all →
                </a>
              </div>
            </div>

            <div className="p-8">
              {getFilesByType(activeFilter).length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {getFilesByType(activeFilter).map((file) => (
                    <div
                      key={file.id}
                      className="group cursor-pointer"
                      onClick={() => handleFileClick(file)}
                    >
                      <div className="bg-gray-100 rounded-2xl p-6 hover:bg-gray-200 transition-colors mb-4 relative">
                        <button
                          onClick={(e) => handleToggleFavorite(file.id, e)}
                          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-300 transition-colors z-10"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              file.is_favorite
                                ? "text-yellow-500 fill-yellow-500"
                                : "text-gray-400 hover:text-yellow-500"
                            }`}
                          />
                        </button>
                        <div className="flex items-center justify-center h-16">
                          {getFileIcon(file.content_type)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.original_name}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>{formatFileSize(file.size)}</span>
                          <span>
                            {new Date(file.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="mx-auto w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
                    <File className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No {activeFilter === "all" ? "files" : activeFilter} found
                  </h3>
                  <p className="text-gray-600 mb-8 max-w-sm mx-auto">
                    {activeFilter === "all"
                      ? "Upload your first file to get started with DriftBox"
                      : `No ${activeFilter.slice(
                          0,
                          -1
                        )} files in your storage yet`}
                  </p>
                  <a
                    href="/dashboard/upload"
                    className="inline-flex items-center px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload{" "}
                    {activeFilter === "all"
                      ? "files"
                      : activeFilter.slice(0, -1)}
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-8">
              <h3 className="text-lg font-medium text-gray-900 mb-6">
                Quick actions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a
                  href="/dashboard/upload"
                  className="flex items-center space-x-4 p-6 text-gray-700 hover:bg-gray-50 rounded-2xl transition-colors group"
                >
                  <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                    <Upload className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 mb-1">
                      Upload files
                    </div>
                    <div className="text-sm text-gray-600">
                      Add new files to your storage
                    </div>
                  </div>
                </a>

                <a
                  href="/dashboard/files"
                  className="flex items-center space-x-4 p-6 text-gray-700 hover:bg-gray-50 rounded-2xl transition-colors group"
                >
                  <div className="p-3 bg-green-50 rounded-xl group-hover:bg-green-100 transition-colors">
                    <Folder className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 mb-1">
                      Create folder
                    </div>
                    <div className="text-sm text-gray-600">
                      Organize your files better
                    </div>
                  </div>
                </a>

                <button className="flex items-center space-x-4 p-6 text-gray-700 hover:bg-gray-50 rounded-2xl transition-colors group">
                  <div className="p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                    <Share2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 mb-1">
                      Share files
                    </div>
                    <div className="text-sm text-gray-600">
                      Share with others securely
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
