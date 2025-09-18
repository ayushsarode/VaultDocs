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
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
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
  const [largeFilesConfirm, setLargeFilesConfirm] = useState<{
    show: boolean;
    files: File[];
    largeFiles: File[];
  }>({
    show: false,
    files: [],
    largeFiles: [],
  });
  const [duplicateFilesConfirm, setDuplicateFilesConfirm] = useState<{
    show: boolean;
    duplicateFiles: { file: File; id: string }[];
    remainingFiles: { file: File; id: string }[];
  }>({
    show: false,
    duplicateFiles: [],
    remainingFiles: [],
  });
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
      const response = await folderAPI.getAllForHierarchy();
      const folders = Array.isArray(response) ? response : [];
      const folderHierarchy = buildFolderHierarchy(folders);
      setFolders(folderHierarchy);
    } catch (error) {
      console.error("Error fetching folders:", error);
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

    const fileArray = Array.from(files);
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
    const largeFiles = fileArray.filter((file) => file.size > MAX_FILE_SIZE);

    if (largeFiles.length > 0) {
      setLargeFilesConfirm({
        show: true,
        files: fileArray,
        largeFiles: largeFiles,
      });
      return;
    }

    // If no large files, proceed with upload
    const newUploadFiles: UploadFile[] = fileArray.map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: "pending",
    }));

    setUploadFiles((prev) => [...prev, ...newUploadFiles]);
  };

  const handleLargeFilesConfirm = () => {
    // Only add files that are within the size limit
    const validFiles = largeFilesConfirm.files.filter(
      (file) => file.size <= 50 * 1024 * 1024
    );

    if (validFiles.length > 0) {
      const newUploadFiles: UploadFile[] = validFiles.map((file) => ({
        file,
        id: Math.random().toString(36).substring(7),
        progress: 0,
        status: "pending",
      }));
      setUploadFiles((prev) => [...prev, ...newUploadFiles]);
    }

    // Close the confirmation modal
    setLargeFilesConfirm({
      show: false,
      files: [],
      largeFiles: [],
    });
  };

  const handleDuplicateFilesConfirm = () => {
    // Close the confirmation modal
    setDuplicateFilesConfirm({
      show: false,
      duplicateFiles: [],
      remainingFiles: [],
    });
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

    // Use environment variable for API URL
    const response = await fetch(`${API_URL}/api/files/upload-multiple`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      clearInterval(progressInterval);
      throw new Error("Authentication failed. Please login again.");
    }

    if (!response.ok) {
      clearInterval(progressInterval);
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));

      // Handle duplicate file error (409)
      if (response.status === 409) {
        // Parse the response to identify which files are duplicates
        let duplicateFiles: { file: File; id: string }[] = [];
        let successfulFiles: { file: File; id: string }[] = [];
        
        if (errorData.duplicate_files && Array.isArray(errorData.duplicate_files)) {
          // Backend provides specific duplicate file names
          duplicateFiles = filesToUpload.filter(uploadFile => 
            errorData.duplicate_files.some((dupName: string) => 
              uploadFile.file.name === dupName
            )
          );
          successfulFiles = filesToUpload.filter(uploadFile => 
            !errorData.duplicate_files.some((dupName: string) => 
              uploadFile.file.name === dupName
            )
          );
        } else if (errorData.errors && Array.isArray(errorData.errors)) {
          // Parse error messages to identify duplicate files
          duplicateFiles = filesToUpload.filter(uploadFile =>
            errorData.errors.some((error: string) =>
              error.includes(uploadFile.file.name) && 
              (error.includes('already exists') || error.includes('duplicate'))
            )
          );
          successfulFiles = filesToUpload.filter(uploadFile => 
            !duplicateFiles.some(dup => dup.id === uploadFile.id)
          );
        } else {
          // Fallback: assume all files are duplicates
          duplicateFiles = filesToUpload;
          successfulFiles = [];
        }

        // Update successful files to success status
        if (successfulFiles.length > 0) {
          setUploadFiles((prev) =>
            prev.map((file) =>
              successfulFiles.some((success) => success.id === file.id)
                ? { ...file, status: "success", progress: 100 }
                : file
            )
          );
        }

        // Show duplicate files confirmation modal if there are any duplicates
        if (duplicateFiles.length > 0) {
          setDuplicateFilesConfirm({
            show: true,
            duplicateFiles: duplicateFiles,
            remainingFiles: successfulFiles,
          });

          // Remove duplicate files from upload queue
          setUploadFiles((prev) =>
            prev.filter(
              (file) => !duplicateFiles.some((dup) => dup.id === file.id)
            )
          );
        }

        return {
          successful: successfulFiles.length,
          duplicates: duplicateFiles.length,
          successful_files: successfulFiles.map(f => ({ 
            name: f.file.name, 
            original_name: f.file.name,
            size: f.file.size,
            content_type: f.file.type
          })),
          duplicate_files: duplicateFiles.map(f => f.file.name)
        };
      }

      throw new Error(
        `HTTP ${response.status}: ${errorData.error || response.statusText}`
      );
    }

    const result = await response.json();

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

          // Check if this file is a duplicate
          const isDuplicate = result.duplicate_files?.includes(file.file.name);

          if (wasSuccessful) {
            return { ...file, status: "success", progress: 100 };
          } else if (isDuplicate) {
            // Handle duplicates - they should already be removed from the queue
            // but just in case, mark as error
            return {
              ...file,
              status: "error",
              error: "File already exists",
              progress: 0,
            };
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
    } else if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("Network error")
    ) {
      alert(
        `❌ Connection failed! Please ensure the server is running on ${API_URL}`
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

    // Use environment variable for API URL
    const response = await fetch(`${API_URL}/api/files/upload`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      clearInterval(progressInterval);
      throw new Error("Authentication failed. Please login again.");
    }

    if (!response.ok) {
      clearInterval(progressInterval);
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      
      // Handle duplicate file error (409) - ADD THIS BLOCK
      if (response.status === 409) {
        // Show duplicate files confirmation modal
        setDuplicateFilesConfirm({
          show: true,
          duplicateFiles: [{ file: uploadFile.file, id: uploadFile.id }],
          remainingFiles: [],
        });
        
        // Remove the file from upload queue since it's a duplicate
        setUploadFiles((prev) => 
          prev.filter(file => file.id !== uploadFile.id)
        );
        
        return;
      }
      
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
    } else if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("Network error")
    ) {
      alert(
        `❌ Connection failed! Please ensure the server is running on ${API_URL}`
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

          {uploadFiles.length > 0 && (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              {/* Header with actions */}
              <div className="bg-gray-50 px-6 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      {uploadFiles.length} file
                      {uploadFiles.length !== 1 ? "s" : ""}
                    </h3>
                    {uploadFiles.some((f) => f.status === "uploading") && (
                      <div className="flex items-center text-blue-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
                        <span className="text-sm">Uploading...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {uploadFiles.some(
                      (f) => f.status === "success" || f.status === "error"
                    ) && (
                      <button
                        onClick={clearCompleted}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear completed
                      </button>
                    )}
                    <button
                      onClick={uploadAllFiles}
                      disabled={
                        !uploadFiles.some(
                          (file) => file.status === "pending"
                        ) ||
                        uploadFiles.some((file) => file.status === "uploading")
                      }
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadFiles.some((f) => f.status === "uploading")
                        ? "Uploading..."
                        : "Upload All"}
                    </button>
                  </div>
                </div>
              </div>

              {/* File list */}
              <div className="max-h-80 overflow-y-auto">
                {uploadFiles.map((uploadFile) => (
                  <div
                    key={uploadFile.id}
                    className="px-6 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        {getStatusIcon(uploadFile.status)}
                      </div>

                      {/* File info and progress */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate pr-4">
                            {uploadFile.file.name}
                          </p>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">
                              {formatFileSize(uploadFile.file.size)}
                            </span>
                            <button
                              onClick={() => removeFile(uploadFile.id)}
                              disabled={uploadFile.status === "uploading"}
                              className="text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar for uploading files */}
                        {uploadFile.status === "uploading" && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>{uploadFile.progress}%</span>
                              <span>
                                {formatFileSize(
                                  (uploadFile.file.size * uploadFile.progress) /
                                    100
                                )}{" "}
                                of {formatFileSize(uploadFile.file.size)}
                              </span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${uploadFile.progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Status messages */}
                        {uploadFile.status === "error" && uploadFile.error && (
                          <p className="text-xs text-red-600 mt-1 truncate">
                            {uploadFile.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Large Files Confirmation Modal */}
          {largeFilesConfirm.show && (
            <div
              className="fixed inset-0 z-[9999]"
              onClick={() => handleLargeFilesConfirm()}
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
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <AlertCircle className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                      Files Too Large
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {largeFilesConfirm.largeFiles.length} file
                      {largeFilesConfirm.largeFiles.length > 1 ? "s" : ""}{" "}
                      exceed
                      {largeFilesConfirm.largeFiles.length === 1 ? "s" : ""} the
                      50MB upload limit and cannot be uploaded:
                    </p>
                    <div className="max-h-32 overflow-y-auto text-left bg-red-50 rounded-lg p-3 mb-4 border border-red-200">
                      {largeFilesConfirm.largeFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center text-xs text-red-700 py-1"
                        >
                          <span className="truncate mr-2">{file.name}</span>
                          <span className="text-red-600 font-medium">
                            {(file.size / (1024 * 1024)).toFixed(1)}MB
                          </span>
                        </div>
                      ))}
                    </div>
                    {largeFilesConfirm.files.length >
                    largeFilesConfirm.largeFiles.length ? (
                      <p className="text-xs text-green-600 mb-2">
                        {largeFilesConfirm.files.length -
                          largeFilesConfirm.largeFiles.length}{" "}
                        smaller file
                        {largeFilesConfirm.files.length -
                          largeFilesConfirm.largeFiles.length >
                        1
                          ? "s"
                          : ""}{" "}
                        will still be uploaded.
                      </p>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      Please compress or split large files to reduce their size
                      below 50MB.
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={() => handleLargeFilesConfirm()}
                      className="px-8 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      {largeFilesConfirm.files.length >
                      largeFilesConfirm.largeFiles.length
                        ? "Upload Valid Files"
                        : "Okay"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Files Confirmation Modal */}
          {duplicateFilesConfirm.show && (
            <div
              className="fixed inset-0 z-[9999]"
              onClick={() => handleDuplicateFilesConfirm()}
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
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <AlertCircle className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                      Duplicate Files Detected
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {duplicateFilesConfirm.duplicateFiles.length} file
                      {duplicateFilesConfirm.duplicateFiles.length > 1
                        ? "s"
                        : ""}{" "}
                      already exist
                      {duplicateFilesConfirm.duplicateFiles.length === 1
                        ? "s"
                        : ""}{" "}
                      in this location:
                    </p>
                    <div className="max-h-32 overflow-y-auto text-left bg-orange-50 rounded-lg p-3 mb-4 border border-orange-200">
                      {duplicateFilesConfirm.duplicateFiles.map(
                        (uploadFile, index) => (
                          <div
                            key={index}
                            className="flex items-center text-xs text-orange-700 py-1"
                          >
                            <File className="h-3 w-3 mr-2 flex-shrink-0" />
                            <span className="truncate">
                              {uploadFile.file.name}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Files with the same name cannot be uploaded to the same
                      folder. Please rename the files or choose a different
                      location.
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={() => handleDuplicateFilesConfirm()}
                      className="px-8 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      Understood
                    </button>
                  </div>
                </div>
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
