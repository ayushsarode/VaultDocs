"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import LoadingSpinner from "@/components/LoadingSpinner";
import { folderAPI } from "@/lib/api";
import {
  Upload,
  File,
  X,
  CheckCircle,
  AlertCircle,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface FolderType {
  id: string;
  name: string;
  parent_id: string | null;
  full_path?: string;
  display_name?: string;
  children?: FolderType[];
  level?: number;
}

interface SuccessfulFile {
  id: string;
  name: string;
  original_name: string;
  size: number;
  content_type: string;
}

function UploadPageContent() {
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folder");

  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [selectedFolder, setSelectedFolder] = useState<string>(
    currentFolderId || ""
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const findFolderById = React.useCallback(
    (folders: FolderType[], id: string): FolderType | null => {
      for (const folder of folders) {
        if (folder.id === id) return folder;
        if (folder.children && folder.children.length > 0) {
          const found = findFolderById(folder.children, id);
          if (found) return found;
        }
      }
      return null;
    },
    []
  );

  const expandParentFolders = React.useCallback(
    (folderId: string) => {
      const folder = findFolderById(folders, folderId);
      if (folder && folder.parent_id) {
        setExpandedFolders((prev) => {
          const newExpanded = new Set(prev);
          newExpanded.add(folder.parent_id!);
          return newExpanded;
        });
        // Recursively expand parent folders
        expandParentFolders(folder.parent_id);
      }
    },
    [folders, findFolderById]
  );

  const fetchAllFolders = React.useCallback(async () => {
    try {
      console.log("Fetching all folders...");
      const response = await folderAPI.getAllForHierarchy();
      console.log("Raw API response:", response);

      // folderAPI.getAllForHierarchy() returns folders array directly, not wrapped in data
      const folders = Array.isArray(response) ? response : [];
      console.log("Folders array:", folders);

      // Build folder hierarchy with full paths
      const folderHierarchy = buildFolderHierarchy(folders);
      console.log("Built hierarchy:", folderHierarchy);

      setFolders(folderHierarchy);
      console.log("Fetched folders:", folderHierarchy.length);
    } catch (error) {
      console.error("Error fetching folders:", error);
      // Set empty array on error
      setFolders([]);
    }
  }, []);

  // Helper function to build folder hierarchy with full paths
  const buildFolderHierarchy = (folders: FolderType[]) => {
    const folderMap = new Map<string, FolderType>();
    const rootFolders: FolderType[] = [];

    // First pass: create folder map
    folders.forEach((folder) => {
      folderMap.set(folder.id, {
        ...folder,
        children: [],
        full_path: folder.name,
        level: 0,
      });
    });

    // Second pass: build hierarchy and full paths
    folders.forEach((folder) => {
      const folderData = folderMap.get(folder.id);
      if (!folderData) return;

      if (folder.parent_id && folderMap.has(folder.parent_id)) {
        // Has parent - add to parent's children and build full path
        const parent = folderMap.get(folder.parent_id);
        if (parent && parent.children) {
          parent.children.push(folderData);
          folderData.full_path = `${parent.full_path}/${folder.name}`;
          folderData.level = (parent.level || 0) + 1;
        }
      } else {
        // Root folder
        rootFolders.push(folderData);
      }
    });

    return rootFolders;
  };

  // Effects
  useEffect(() => {
    fetchAllFolders();
  }, [fetchAllFolders]);

  useEffect(() => {
    // Update selected folder when URL parameter changes
    if (currentFolderId) {
      setSelectedFolder(currentFolderId);
      // Auto-expand parent folders when a folder is selected
      expandParentFolders(currentFolderId);
    }
  }, [currentFolderId, expandParentFolders]);

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return newExpanded;
    });
  };

  // Recursive component for rendering folder tree
  const FolderTreeItem: React.FC<{ folder: FolderType; level: number }> = ({
    folder,
    level,
  }) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder === folder.id;

    const handleFolderSelect = () => {
      setSelectedFolder(folder.id);
      // Auto-expand parent folders when selecting
      if (folder.parent_id) {
        expandParentFolders(folder.parent_id);
      }
    };

    return (
      <div key={folder.id}>
        <div
          className={`w-full border rounded-lg transition-colors ${
            isSelected ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
          style={{ marginLeft: `${level * 20}px` }}
        >
          <div className="flex items-center">
            {/* Dropdown Arrow Button */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderExpansion(folder.id);
                }}
                className="flex-shrink-0 p-3 hover:bg-gray-100 rounded-l-lg border-r border-gray-200 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                )}
              </button>
            ) : (
              <div className="w-10 flex-shrink-0" />
            )}

            {/* Folder Selection Button */}
            <button
              onClick={handleFolderSelect}
              className="flex-1 p-3 text-left hover:bg-gray-50 transition-colors rounded-r-lg flex items-center"
            >
              <Folder className="h-5 w-5 text-yellow-500 mr-3 flex-shrink-0" />
              <span className="font-medium truncate">{folder.name}</span>
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-2 space-y-2">
            {folder.children!.map((child) => (
              <FolderTreeItem key={child.id} folder={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newUploadFiles: UploadFile[] = Array.from(files).map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: "pending",
    }));

    setUploadFiles((prev) => [...prev, ...newUploadFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = (id: string) => {
    setUploadFiles((prev) => prev.filter((file) => file.id !== id));
  };

  // Upload multiple files using the new backend endpoint with goroutines
  const uploadMultipleFiles = async (filesToUpload: UploadFile[]) => {
    // If only one file, use single upload endpoint
    if (filesToUpload.length === 1) {
      return await uploadSingleFileAPI(filesToUpload[0]);
    }

    const formData = new FormData();

    // Add all files to FormData
    filesToUpload.forEach((uploadFile) => {
      formData.append("files", uploadFile.file);
    });

    // Add folder ID if selected
    if (selectedFolder) {
      formData.append("folder_id", selectedFolder);
    }

    // Set all files to uploading status
    setUploadFiles((prev) =>
      prev.map((file) =>
        filesToUpload.some((f) => f.id === file.id)
          ? { ...file, status: "uploading", progress: 0 }
          : file
      )
    );

    try {
      // Get token from cookies (same as api.ts)
      const token = Cookies.get("token");
      console.log(
        "🔑 Token check for multiple upload:",
        token ? "Token exists" : "No token found"
      );

      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }

      // Start progress animation before making the request
      const progressInterval = setInterval(() => {
        setUploadFiles((prev) =>
          prev.map((file) =>
            filesToUpload.some((f) => f.id === file.id) &&
            file.status === "uploading"
              ? { ...file, progress: Math.min(file.progress + 8, 85) }
              : file
          )
        );
      }, 300);

      // Use multiple upload endpoint for multiple files
      const response = await fetch(
        "http://localhost:8000/api/files/upload-multiple",
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log("📤 Multiple upload response status:", response.status);

      if (response.status === 401) {
        clearInterval(progressInterval);
        throw new Error("Authentication failed. Please login again.");
      }

      if (!response.ok) {
        clearInterval(progressInterval);
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          `HTTP ${response.status}: ${errorData.error || response.statusText}`
        );
      }

      const result = await response.json();

      console.log("📤 Multiple upload result:", result);
      console.log("📊 Backend response structure:", {
        successful: result.successful,
        failed: result.failed,
        successful_files: result.successful_files,
        errors: result.errors,
        total_uploaded: result.total_uploaded,
      });

      // Continue progress to 95% before completing
      setUploadFiles((prev) =>
        prev.map((file) =>
          filesToUpload.some((f) => f.id === file.id) &&
          file.status === "uploading"
            ? { ...file, progress: 95 }
            : file
        )
      );

      // Wait a moment then clear interval and update final status
      setTimeout(() => {
        clearInterval(progressInterval);

        // Update files based on backend response format
        setUploadFiles((prev) =>
          prev.map((file) => {
            const uploadIndex = filesToUpload.findIndex(
              (f) => f.id === file.id
            );
            if (uploadIndex === -1) return file;

            // Check if this file was uploaded successfully
            const wasSuccessful = result.successful_files?.some(
              (successFile: SuccessfulFile) =>
                successFile.original_name === file.file.name ||
                successFile.name === file.file.name
            );

            // Check if this file had an error
            const errorMessage = result.errors?.find((error: string) =>
              error.includes(file.file.name)
            );

            if (wasSuccessful) {
              return { ...file, status: "success", progress: 100 };
            } else if (errorMessage) {
              return {
                ...file,
                status: "error",
                error: errorMessage,
                progress: 0,
              };
            } else if (
              result.successful > 0 &&
              uploadIndex < result.successful
            ) {
              // Fallback: assume first N files were successful
              return { ...file, status: "success", progress: 100 };
            } else {
              return {
                ...file,
                status: "error",
                error: "Upload failed",
                progress: 0,
              };
            }
          })
        );
      }, 500);

      // Show success/failure messages
      if (result.successful > 0) {
        console.log(`✅ Successfully uploaded ${result.successful} files`);
      }

      if (result.failed > 0) {
        console.warn(`❌ Failed to upload ${result.failed} files`);
      }

      return result;
    } catch (error: unknown) {
      console.error("Upload error:", error);

      // Set all files to error status
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setUploadFiles((prev) =>
        prev.map((file) =>
          filesToUpload.some((f) => f.id === file.id)
            ? {
                ...file,
                status: "error",
                error: errorMessage,
                progress: 0,
              }
            : file
        )
      );

      // Show user-friendly error message
      if (
        errorMessage.includes("authentication") ||
        errorMessage.includes("Authentication")
      ) {
        alert("🔒 Authentication failed! Please login again.");
        // Optionally redirect to login page
        // window.location.href = '/auth/login';
      } else if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("Network error")
      ) {
        alert(
          "❌ Connection failed! Please ensure the server is running on http://localhost:8000"
        );
      } else {
        alert(`❌ Upload failed: ${errorMessage}`);
      }
    }
  };

  // Single file upload using the single upload endpoint
  const uploadSingleFileAPI = async (uploadFile: UploadFile) => {
    const formData = new FormData();
    formData.append("file", uploadFile.file);

    // Add folder ID if selected
    if (selectedFolder) {
      formData.append("folder_id", selectedFolder);
    }

    // Set file to uploading status
    setUploadFiles((prev) =>
      prev.map((file) =>
        file.id === uploadFile.id
          ? { ...file, status: "uploading", progress: 0 }
          : file
      )
    );

    try {
      // Get token from cookies (same as api.ts)
      const token = Cookies.get("token");
      console.log("🔑 Token check:", token ? "Token exists" : "No token found");

      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }

      // Start progress animation before making the request
      const progressInterval = setInterval(() => {
        setUploadFiles((prev) =>
          prev.map((file) =>
            file.id === uploadFile.id && file.status === "uploading"
              ? { ...file, progress: Math.min(file.progress + 12, 85) }
              : file
          )
        );
      }, 200);

      // Use single upload endpoint
      const response = await fetch("http://localhost:8000/api/files/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("📤 Upload response status:", response.status);

      if (response.status === 401) {
        clearInterval(progressInterval);
        throw new Error("Authentication failed. Please login again.");
      }

      if (!response.ok) {
        clearInterval(progressInterval);
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          `HTTP ${response.status}: ${errorData.error || response.statusText}`
        );
      }

      const result = await response.json();

      // Continue progress to 95% before completing
      setUploadFiles((prev) =>
        prev.map((file) =>
          file.id === uploadFile.id && file.status === "uploading"
            ? { ...file, progress: 95 }
            : file
        )
      );

      // Wait a moment then clear interval and set to 100%
      setTimeout(() => {
        clearInterval(progressInterval);

        // Update file status based on backend response format
        setUploadFiles((prev) =>
          prev.map((file) =>
            file.id === uploadFile.id
              ? result.file
                ? { ...file, status: "success", progress: 100 }
                : {
                    ...file,
                    status: "error",
                    error: result.message || "Upload failed",
                    progress: 0,
                  }
              : file
          )
        );
      }, 300);

      console.log("📤 Single upload result:", result);
      console.log("📊 Single upload response structure:", {
        message: result.message,
        file: result.file,
        hasFile: !!result.file,
      });

      if (result.file) {
        console.log(`✅ Successfully uploaded: ${uploadFile.file.name}`);
      } else {
        console.warn(
          `❌ Failed to upload: ${uploadFile.file.name} - ${result.message}`
        );
      }

      return result;
    } catch (error: unknown) {
      console.error("Single upload error:", error);

      // Set file to error status
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setUploadFiles((prev) =>
        prev.map((file) =>
          file.id === uploadFile.id
            ? {
                ...file,
                status: "error",
                error: errorMessage,
                progress: 0,
              }
            : file
        )
      );

      // Show user-friendly error message
      if (
        errorMessage.includes("authentication") ||
        errorMessage.includes("Authentication")
      ) {
        alert("🔒 Authentication failed! Please login again.");
        // Optionally redirect to login page
        // window.location.href = '/auth/login';
      } else if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("Network error")
      ) {
        alert(
          "❌ Connection failed! Please ensure the server is running on http://localhost:8000"
        );
      } else {
        alert(`❌ Upload failed: ${errorMessage}`);
      }
    }
  };

  const uploadAllFiles = async () => {
    const pendingFiles = uploadFiles.filter(
      (file) => file.status === "pending"
    );

    if (pendingFiles.length === 0) return;

    // Upload all pending files together using goroutines
    await uploadMultipleFiles(pendingFiles);
  };

  const clearCompleted = () => {
    setUploadFiles((prev) =>
      prev.filter(
        (file) => file.status !== "success" && file.status !== "error"
      )
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "uploading":
        return (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
        );
      default:
        return <File className="h-5 w-5 text-gray-400" />;
    }
  };

  // Upload Statistics Component
  const UploadStats = () => {
    const totalFiles = uploadFiles.length;
    const pending = uploadFiles.filter((f) => f.status === "pending").length;
    const uploading = uploadFiles.filter(
      (f) => f.status === "uploading"
    ).length;
    const success = uploadFiles.filter((f) => f.status === "success").length;
    const failed = uploadFiles.filter((f) => f.status === "error").length;
    const totalSize = uploadFiles.reduce((acc, f) => acc + f.file.size, 0);

    // Calculate progressive uploaded size based on progress
    const uploadedSize = uploadFiles.reduce((acc, f) => {
      if (f.status === "success") {
        return acc + f.file.size; // Fully uploaded
      } else if (f.status === "uploading") {
        return acc + (f.file.size * f.progress) / 100; // Partially uploaded based on progress
      }
      return acc; // Pending or failed files don't count
    }, 0);

    if (totalFiles === 0) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          Upload Statistics
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="text-blue-700 font-medium">Total Files:</span>
            <div className="text-blue-900">{totalFiles}</div>
          </div>
          <div>
            <span className="text-yellow-700 font-medium">Pending:</span>
            <div className="text-yellow-900">{pending}</div>
          </div>
          <div>
            <span className="text-blue-700 font-medium">Uploading:</span>
            <div className="text-blue-900">{uploading}</div>
          </div>
          <div>
            <span className="text-green-700 font-medium">Success:</span>
            <div className="text-green-900">{success}</div>
          </div>
          <div>
            <span className="text-red-700 font-medium">Failed:</span>
            <div className="text-red-900">{failed}</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <span className="text-blue-700 font-medium text-sm">
              Total Size:
            </span>
            <span className="text-blue-900 ml-1">
              {formatFileSize(totalSize)}
            </span>
          </div>
          <div>
            <span className="text-green-700 font-medium text-sm">
              Uploaded:
            </span>
            <span className="text-green-900 ml-1">
              {formatFileSize(uploadedSize)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6 p-10">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Files</h1>
            <p className="mt-1 text-sm text-gray-600">
              Upload files to your cloud storage. Maximum file size: 50MB
            </p>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Select Destination Folder
                {selectedFolder && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Current:{" "}
                    {findFolderById(folders, selectedFolder)?.full_path ||
                      "Root"}
                    )
                  </span>
                )}
              </h3>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {/* Root Folder */}
              <button
                onClick={() => setSelectedFolder("")}
                className={`w-full p-3 border rounded-lg text-left hover:bg-gray-50 transition-colors ${
                  selectedFolder === ""
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <div className="flex items-center">
                  <FolderOpen className="h-5 w-5 text-blue-500 mr-3" />
                  <span className="font-medium">📁 Root Folder</span>
                </div>
              </button>

              {/* Hierarchical Folder Tree */}
              {Array.isArray(folders) &&
                folders.map((folder) => (
                  <FolderTreeItem key={folder.id} folder={folder} level={0} />
                ))}
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                Upload files
              </h3>
              <div className="mt-1">
                <p className="text-sm text-gray-500">
                  Drag and drop files here, or{" "}
                  <button
                    type="button"
                    className="font-medium text-blue-600 hover:text-blue-500"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                PNG, JPG, PDF, DOC, DOCX up to 50MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                accept="*/*"
              />
            </div>
          </div>

          {/* Upload Statistics */}
          <UploadStats />

          {uploadFiles.length > 0 && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Upload Queue ({uploadFiles.length} files)
                    {uploadFiles.some((f) => f.status === "uploading") && (
                      <span className="ml-2 text-sm text-blue-600 font-normal">
                        Uploading in parallel...
                      </span>
                    )}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={uploadAllFiles}
                      disabled={
                        !uploadFiles.some(
                          (file) => file.status === "pending"
                        ) ||
                        uploadFiles.some((file) => file.status === "uploading")
                      }
                      className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadFiles.some((f) => f.status === "uploading") ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Uploading All...
                        </>
                      ) : (
                        "Upload All Files"
                      )}
                    </button>
                    <button
                      onClick={clearCompleted}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Clear Completed
                    </button>
                  </div>
                </div>

                {/* Progress Summary */}
                {uploadFiles.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                    <div className="text-gray-600">
                      Pending:{" "}
                      {uploadFiles.filter((f) => f.status === "pending").length}
                    </div>
                    <div className="text-blue-600">
                      Uploading:{" "}
                      {
                        uploadFiles.filter((f) => f.status === "uploading")
                          .length
                      }
                    </div>
                    <div className="text-green-600">
                      Success:{" "}
                      {uploadFiles.filter((f) => f.status === "success").length}
                    </div>
                    <div className="text-red-600">
                      Failed:{" "}
                      {uploadFiles.filter((f) => f.status === "error").length}
                    </div>
                  </div>
                )}
              </div>
              <div className="divide-y divide-gray-200">
                {uploadFiles.map((uploadFile) => (
                  <div key={uploadFile.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {getStatusIcon(uploadFile.status)}
                        </div>
                        <div className="ml-4 flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {uploadFile.file.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(uploadFile.file.size)}
                          </p>
                          {uploadFile.status === "uploading" && (
                            <div className="mt-2">
                              <div className="bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${uploadFile.progress}%` }}
                                ></div>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {uploadFile.progress}% complete
                              </p>
                            </div>
                          )}
                          {uploadFile.status === "success" && (
                            <p className="text-sm text-green-600 mt-1">
                              ✅ Upload completed successfully
                            </p>
                          )}
                          {uploadFile.status === "error" &&
                            uploadFile.error && (
                              <p className="text-sm text-red-600 mt-1">
                                ❌ {uploadFile.error}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex space-x-2">
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          disabled={uploadFile.status === "uploading"}
                          className="inline-flex items-center p-1 border border-transparent rounded text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <LoadingSpinner variant="fullscreen" text="Loading upload page..." />
      }
    >
      <UploadPageContent />
    </Suspense>
  );
}
