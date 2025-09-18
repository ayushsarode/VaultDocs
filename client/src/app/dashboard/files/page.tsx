"use client";

import React, { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import LoadingSpinner from "@/components/LoadingSpinner";
import { fileAPI, folderAPI } from "@/lib/api";
import {
  Folder,
  File,
  Download,
  Trash2,
  MoreVertical,
  ArrowLeft,
  Search,
  Grid,
  List,
  Upload,
  FolderPlus,
  Star,
  Share2,
  Filter,
  SortAsc,
  MoreHorizontal,
  Loader2,
} from "lucide-react";

interface FileType {
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

interface FolderType {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileType[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterBy, setFilterBy] = useState<
    "all" | "files" | "folders" | "favorites"
  >("all");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    type: "file" | "folder";
    id: string;
    name: string;
    loading: boolean;
  }>({
    show: false,
    type: "file",
    id: "",
    name: "",
    loading: false,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown-container")) {
        setDropdownOpen(null);
        setShowSortDropdown(false);
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [filesResponse, foldersResponse] = await Promise.all([
        fileAPI.getAll(currentFolder || undefined),
        folderAPI.getAll(currentFolder || undefined),
      ]);

      const filesArray = Array.isArray(filesResponse) ? filesResponse : [];
      const foldersArray = Array.isArray(foldersResponse)
        ? foldersResponse
        : [];

      // No need to filter here since the API already filters by folder
      setFiles(filesArray);
      setFolders(foldersArray);
    } catch (error) {
      console.error("Error fetching data:", error);
      setFiles([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await fileAPI.download(fileId);

      if (response.method === "proxy") {
        // For proxy downloads, the URL is a blob URL that needs to be downloaded
        const link = document.createElement("a");
        link.href = response.download_url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL
        window.URL.revokeObjectURL(response.download_url);
      } else {
        // For signed URLs, open in a new tab
        window.open(response.download_url, "_blank");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file. Please try again.");
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    setDeleteConfirm({
      show: true,
      type: "file",
      id: fileId,
      name: fileName,
      loading: false,
    });
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    setDeleteConfirm({
      show: true,
      type: "folder",
      id: folderId,
      name: folderName,
      loading: false,
    });
  };

  const confirmDelete = async () => {
    setDeleteConfirm((prev) => ({ ...prev, loading: true }));

    try {
      if (deleteConfirm.type === "file") {
        setDeletingFileId(deleteConfirm.id);
        await fileAPI.delete(deleteConfirm.id);
      } else {
        setDeletingFolderId(deleteConfirm.id);
        await folderAPI.delete(deleteConfirm.id);
      }

      fetchData();
      setDeleteConfirm({
        show: false,
        type: "file",
        id: "",
        name: "",
        loading: false,
      });
    } catch (error) {
      console.error(`Error deleting ${deleteConfirm.type}:`, error);
      alert(`Failed to delete ${deleteConfirm.type}. Please try again.`);
      setDeleteConfirm((prev) => ({ ...prev, loading: false }));
    } finally {
      setDeletingFileId(null);
      setDeletingFolderId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({
      show: false,
      type: "file",
      id: "",
      name: "",
      loading: false,
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await folderAPI.create({
        name: newFolderName,
        parent_id: currentFolder || undefined,
      });
      setNewFolderName("");
      setShowCreateFolder(false);
      fetchData();
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  };

  const handleToggleFavorite = async (fileId: string) => {
    try {
      await fileAPI.toggleFavorite(fileId);

      // Update the local state to reflect the change immediately
      setFiles((prevFiles) =>
        prevFiles.map((file) =>
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

  const handleViewFile = async (file: FileType) => {
    try {
      setViewingFileId(file.id);
      const response = await fileAPI.download(file.id);

      if (response.method === "proxy") {
        const link = document.createElement("a");
        link.href = response.download_url;

        if (
          file.content_type?.includes("image") ||
          file.content_type?.includes("pdf") ||
          file.content_type?.includes("text")
        ) {
          link.target = "_blank";
          link.click();
        } else {
          link.download = file.original_name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        setTimeout(
          () => window.URL.revokeObjectURL(response.download_url),
          100
        );
      } else {
        window.open(response.download_url, "_blank");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      alert("Failed to open file. Please try again.");
    } finally {
      setViewingFileId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Filter and sort items based on search term, filter, and sort options
  const filteredAndSortedFolders = folders
    .filter((folder) => {
      // Search filter
      const matchesSearch = folder.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // Type filter
      const matchesFilter = filterBy === "all" || filterBy === "folders";

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "date":
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

  const filteredAndSortedFiles = files
    .filter((file) => {
      // Search filter
      const matchesSearch = file.original_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // Type filter
      let matchesFilter = false;
      switch (filterBy) {
        case "all":
          matchesFilter = true;
          break;
        case "files":
          matchesFilter = true;
          break;
        case "favorites":
          matchesFilter = file.is_favorite === true;
          break;
        case "folders":
          matchesFilter = false;
          break;
        default:
          matchesFilter = true;
      }

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.original_name.localeCompare(b.original_name);
          break;
        case "date":
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        default:
          comparison = a.original_name.localeCompare(b.original_name);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

  // Keep the original variable names for compatibility
  const filteredFolders = filteredAndSortedFolders;
  const filteredFiles = filteredAndSortedFiles;

  if (loading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <LoadingSpinner variant="fullscreen" text="Loading your files..." />
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex items-center space-x-4">
              {currentFolder && (
                <button
                  onClick={() => setCurrentFolder(null)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Back</span>
                </button>
              )}
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
                  {currentFolder ? "Folder Contents" : "My Files"}
                </h1>
                <p className="text-gray-600 mt-1 text-sm">
                  {filteredFolders.length + filteredFiles.length} items
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3 overflow-x-auto pb-2 sm:pb-0 relative">
              <div className="flex items-center bg-gray-100 rounded-lg p-1 flex-shrink-0">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === "list"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === "grid"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="Grid view"
                >
                  <Grid className="h-4 w-4" />
                </button>
              </div>

              <div className="relative dropdown-container flex-shrink-0">
                <button
                  onClick={() => {
                    setShowSortDropdown(!showSortDropdown);
                    setShowFilterDropdown(false);
                  }}
                  className="inline-flex items-center px-2 sm:px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <SortAsc className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sort</span>
                </button>

                {showSortDropdown && (
                  <div
                    className="fixed inset-0 z-50"
                    onClick={() => setShowSortDropdown(false)}
                  >
                    <div
                      className="absolute top-35 right-62 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-80 overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Sort by
                      </div>
                      <button
                        onClick={() => {
                          setSortBy("name");
                          setShowSortDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          sortBy === "name"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Name
                      </button>
                      <button
                        onClick={() => {
                          setSortBy("date");
                          setShowSortDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          sortBy === "date"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Date
                      </button>
                      <button
                        onClick={() => {
                          setSortBy("size");
                          setShowSortDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          sortBy === "size"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Size
                      </button>
                      <hr className="my-1" />
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Order
                      </div>
                      <button
                        onClick={() => {
                          setSortOrder("asc");
                          setShowSortDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          sortOrder === "asc"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Ascending
                      </button>
                      <button
                        onClick={() => {
                          setSortOrder("desc");
                          setShowSortDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          sortOrder === "desc"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Descending
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative dropdown-container flex-shrink-0">
                <button
                  onClick={() => {
                    setShowFilterDropdown(!showFilterDropdown);
                    setShowSortDropdown(false);
                  }}
                  className="inline-flex items-center px-2 sm:px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Filter className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Filter</span>
                  {filterBy !== "all" && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                      1
                    </span>
                  )}
                </button>

                {showFilterDropdown && (
                  <div
                    className="fixed inset-0 z-50"
                    onClick={() => setShowFilterDropdown(false)}
                  >
                    <div
                      className="absolute top-35 right-38 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-80 overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Show
                      </div>
                      <button
                        onClick={() => {
                          setFilterBy("all");
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          filterBy === "all"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        All items
                      </button>
                      <button
                        onClick={() => {
                          setFilterBy("files");
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          filterBy === "files"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Files only
                      </button>
                      <button
                        onClick={() => {
                          setFilterBy("folders");
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          filterBy === "folders"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Folders only
                      </button>
                      <button
                        onClick={() => {
                          setFilterBy("favorites");
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                          filterBy === "favorites"
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        Favorites only
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowCreateFolder(true)}
                className="inline-flex items-center px-3 sm:px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <FolderPlus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New folder</span>
              </button>

              <a
                href={`/dashboard/upload${
                  currentFolder ? `?folder=${currentFolder}` : ""
                }`}
                className="inline-flex items-center px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
              >
                <Upload className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Upload</span>
              </a>
            </div>
          </div>

          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
              <div className="text-center py-12 sm:py-16 px-4">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mb-6">
                  <Folder className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? "No results found" : "This folder is empty"}
                </h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm sm:text-base">
                  {searchTerm
                    ? "Try adjusting your search terms or browse your files."
                    : "Get started by uploading files or creating new folders to organize your content."}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-3">
                  <button
                    onClick={() => setShowCreateFolder(true)}
                    className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors w-full sm:w-auto"
                  >
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New folder
                  </button>
                  <a
                    href={`/dashboard/upload${
                      currentFolder ? `?folder=${currentFolder}` : ""
                    }`}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload files
                  </a>
                </div>
              </div>
            ) : viewMode === "list" ? (
              <div className="divide-y divide-gray-100">
                {filteredFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center p-3 sm:p-4 hover:bg-gray-50 group transition-colors"
                  >
                    <div
                      className="flex items-center flex-1 cursor-pointer min-w-0"
                      onClick={() => setCurrentFolder(folder.id)}
                    >
                      <div className="flex-shrink-0 mr-3 sm:mr-4">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Folder className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {folder.name}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          Folder •{" "}
                          {new Date(folder.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <Star className="h-3 w-3 sm:h-4 sm:w-4" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id, folder.name);
                        }}
                        disabled={deletingFolderId === folder.id}
                        className={`p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors ${
                          deletingFolderId === folder.id
                            ? "text-blue-500 cursor-not-allowed"
                            : "text-gray-400 hover:text-red-600"
                        }`}
                      >
                        {deletingFolderId === folder.id ? (
                          <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        )}
                      </button>
                      <button className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg hidden sm:block">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center p-3 sm:p-4 hover:bg-gray-50 group transition-colors"
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="flex-shrink-0 mr-3 sm:mr-4">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <File className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
                        </div>
                      </div>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleViewFile(file)}
                      >
                        <p
                          className={`text-sm font-medium truncate transition-colors ${
                            viewingFileId === file.id
                              ? "text-blue-600"
                              : "text-gray-900 hover:text-blue-600"
                          }`}
                        >
                          {viewingFileId === file.id ? (
                            <span className="flex items-center">
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {file.original_name}
                            </span>
                          ) : (
                            file.original_name
                          )}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {formatFileSize(file.size)} •{" "}
                          {new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(file.id);
                        }}
                        className={`p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors ${
                          file.is_favorite
                            ? "text-yellow-500"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        <Star
                          className={`h-3 w-3 sm:h-4 sm:w-4 ${
                            file.is_favorite ? "fill-current" : ""
                          }`}
                        />
                      </button>

                      <div className="relative dropdown-container">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();

                            setDropdownOpen(
                              dropdownOpen === file.id ? null : file.id
                            );
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {dropdownOpen === file.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();

                                handleDownload(file.id, file.original_name);
                                setDropdownOpen(null);
                              }}
                              className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                            >
                              <Download className="h-4 w-4 mr-3" />
                              Download
                            </button>

                            <hr className="my-1" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();

                                handleDeleteFile(file.id, file.original_name);
                                setDropdownOpen(null);
                              }}
                              disabled={deletingFileId === file.id}
                              className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                                deletingFileId === file.id
                                  ? "text-blue-600 bg-blue-50 cursor-not-allowed"
                                  : "text-red-600 hover:bg-red-50"
                              }`}
                            >
                              {deletingFileId === file.id ? (
                                <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-3" />
                              )}
                              {deletingFileId === file.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Grid View
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
                  {filteredFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="group relative bg-white hover:bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-all"
                      onClick={() => setCurrentFolder(folder.id)}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
                          <Folder className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-gray-900 truncate w-full">
                          {folder.name}
                        </p>
                      </div>
                      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(folder.id, folder.name);
                          }}
                          disabled={deletingFolderId === folder.id}
                          className={`p-1 hover:bg-white rounded transition-colors ${
                            deletingFolderId === folder.id
                              ? "text-blue-500 cursor-not-allowed"
                              : "text-gray-400 hover:text-red-600"
                          }`}
                        >
                          {deletingFolderId === folder.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}

                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group relative bg-white hover:bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-all"
                    >
                      <div
                        className="flex flex-col items-center text-center cursor-pointer"
                        onClick={() => handleViewFile(file)}
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
                          {viewingFileId === file.id ? (
                            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 animate-spin" />
                          ) : (
                            <File className="h-6 w-6 sm:h-8 sm:w-8 text-gray-600" />
                          )}
                        </div>
                        <p
                          className={`text-xs sm:text-sm font-medium truncate w-full transition-colors ${
                            viewingFileId === file.id
                              ? "text-blue-600"
                              : "text-gray-900 hover:text-blue-600"
                          }`}
                        >
                          {file.original_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 hidden sm:block">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(file.id);
                          }}
                          className={`p-1 hover:bg-white rounded transition-colors ${
                            file.is_favorite
                              ? "text-yellow-500"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          <Star
                            className={`h-3 w-3 ${
                              file.is_favorite ? "fill-current" : ""
                            }`}
                          />
                        </button>

                        <div className="relative dropdown-container">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();

                              setDropdownOpen(
                                dropdownOpen === file.id ? null : file.id
                              );
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white rounded"
                          >
                            <MoreVertical className="h-3 w-3" />
                          </button>

                          {dropdownOpen === file.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();

                                  handleDownload(file.id, file.original_name);
                                  setDropdownOpen(null);
                                }}
                                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                              >
                                <Download className="h-4 w-4 mr-3" />
                                Download
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();

                                  setDropdownOpen(null);
                                }}
                                className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                              >
                                <Share2 className="h-4 w-4 mr-3" />
                                Share
                              </button>
                              <hr className="my-1" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file.id, file.original_name);
                                  setDropdownOpen(null);
                                }}
                                disabled={deletingFileId === file.id}
                                className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                                  deletingFileId === file.id
                                    ? "text-blue-600 bg-blue-50 cursor-not-allowed"
                                    : "text-red-600 hover:bg-red-50"
                                }`}
                              >
                                {deletingFileId === file.id ? (
                                  <Loader2 className="h-4 w-4 mr-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-3" />
                                )}
                                {deletingFileId === file.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Folder Modal - Outside of layout containers for full viewport blur */}
        {showCreateFolder && (
          <div
            className="fixed inset-0 z-[9999]"
            onClick={() => {
              setShowCreateFolder(false);
              setNewFolderName("");
            }}
          >
            {/* Blur overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-lg"></div>

            {/* Modal content */}
            <div className="relative h-full flex items-center justify-center p-4">
              <div
                className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md mx-4 shadow-2xl border border-white/20 relative z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <FolderPlus className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Create New Folder
                  </h3>
                  <p className="text-sm text-gray-600">
                    Choose a name for your new folder
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <input
                      type="text"
                      placeholder="Enter folder name..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500 text-sm sm:text-base"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newFolderName.trim()) {
                          handleCreateFolder();
                        }
                        if (e.key === "Escape") {
                          setShowCreateFolder(false);
                          setNewFolderName("");
                        }
                      }}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => {
                        setShowCreateFolder(false);
                        setNewFolderName("");
                      }}
                      className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100/80 border border-gray-200/50 rounded-xl hover:bg-gray-200/80 transition-all duration-200 backdrop-blur-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl disabled:hover:shadow-lg"
                    >
                      Create Folder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm.show && (
          <div
            className="fixed inset-0 z-[9999] transition-opacity duration-300"
            onClick={!deleteConfirm.loading ? cancelDelete : undefined}
          >
            {/* Blur overlay with smooth animation */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-lg transition-all duration-300"></div>

            {/* Modal content */}
            <div className="relative h-full flex items-center justify-center p-4">
              <div
                className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md mx-4 shadow-2xl border border-white/20 relative z-10 transform transition-all duration-300 scale-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Trash2 className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Delete {deleteConfirm.type === "file" ? "File" : "Folder"}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {deleteConfirm.type === "file"
                      ? `Are you sure you want to delete "${deleteConfirm.name}"?`
                      : `Are you sure you want to delete "${deleteConfirm.name}" and all its contents?`}
                  </p>
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    This action cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                  <button
                    onClick={cancelDelete}
                    disabled={deleteConfirm.loading}
                    className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100/80 border border-gray-200/50 rounded-xl hover:bg-gray-200/80 transition-all duration-200 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleteConfirm.loading}
                    className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl disabled:hover:shadow-lg flex items-center justify-center min-w-[120px]"
                  >
                    {deleteConfirm.loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
