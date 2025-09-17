import axios from "axios";
import Cookies from "js-cookie";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove("token");
      Cookies.remove("user");
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);

// Auth API functions
export const authAPI = {
  register: async (userData: {
    username: string;
    email: string;
    password: string;
  }) => {
    const response = await api.post("/register", userData);
    return response.data;
  },

  login: async (credentials: { email: string; password: string }) => {
    const response = await api.post("/login", credentials);
    if (response.data.token) {
      Cookies.set("token", response.data.token, { expires: 7 });
      Cookies.set("user", JSON.stringify(response.data.user), { expires: 7 });
    }
    return response.data;
  },

  googleLogin: () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  },

  logout: () => {
    Cookies.remove("token");
    Cookies.remove("user");
    window.location.href = "/auth/login";
  },

  getProfile: async () => {
    const response = await api.get("/api/profile");
    return response.data;
  },

  deleteProfile: async () => {
    const response = await api.delete("/api/profile");
    return response.data;
  },
};

// Folder API functions
export const folderAPI = {
  create: async (folderData: { name: string; parent_id?: string }) => {
    const response = await api.post("/api/folders", folderData);
    return response.data;
  },

  getAll: async (parent_id?: string) => {
    const params = parent_id ? { parent_id } : {};
    const response = await api.get("/api/folders", { params });
    // Extract folders array from the response object
    return response.data.folders || [];
  },

  getAllForHierarchy: async () => {
    const response = await api.get("/api/folders/all");
    return response.data;
  },

  delete: async (folderId: string) => {
    const response = await api.delete(`/api/folders/${folderId}`);
    return response.data;
  },
};

// File API functions
export const fileAPI = {
  upload: async (formData: FormData) => {
    const response = await api.post("/api/files/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  getAll: async (folder_id?: string) => {
    const params = folder_id ? { folder_id } : {};
    const response = await api.get("/api/files", { params });
    // Extract files array from the response object
    return response.data.files || [];
  },

  download: async (fileId: string) => {
    try {
      // Try direct download first (proxy method)
      const response = await api.get(`/api/files/${fileId}/download`, {
        responseType: "blob",
      });

      // Create a blob URL for the downloaded file
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      return { download_url: url, method: "proxy" };
    } catch (error) {
      console.warn("Direct download failed, trying signed URL method:", error);

      // Fallback to signed URL method
      try {
        const urlResponse = await api.get(
          `/api/files/${fileId}/download?redirect=true`
        );
        return urlResponse.data;
      } catch (signedUrlError) {
        console.error("Both download methods failed:", signedUrlError);
        throw signedUrlError;
      }
    }
  },

  delete: async (fileId: string) => {
    const response = await api.delete(`/api/files/${fileId}`);
    return response.data;
  },

  toggleFavorite: async (fileId: string) => {
    console.log(
      `Making request to: POST ${API_BASE_URL}/api/files/toggle-favorite/${fileId}`
    );
    try {
      const response = await api.post(`/api/files/toggle-favorite/${fileId}`);
      console.log("Toggle favorite response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Toggle favorite error:", error);
      throw error;
    }
  },

  getFavorites: async () => {
    console.log(`Making request to: GET ${API_BASE_URL}/api/files/favorites`);
    try {
      const response = await api.get("/api/files/favorites");
      console.log("Get favorites response:", response.data);
      return response.data.files || [];
    } catch (error) {
      console.error("Get favorites error:", error);
      throw error;
    }
  },

  // Test endpoint to verify server connectivity
  testConnection: async () => {
    try {
      const response = await api.get("/api/files");
      console.log("Server connection test successful");
      return response.data;
    } catch (error) {
      console.error("Server connection test failed:", error);
      throw error;
    }
  },
};

// Storage API functions
export const storageAPI = {
  getInfo: async () => {
    const response = await api.get("/api/storage");
    // Extract storage object from the response
    return response.data.storage || {};
  },
};

export default api;
