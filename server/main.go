package main

import (
	"log"
	"net/http"
	"os"

	"github.com/ayushsarode/VaultDocs/handlers"
	"github.com/ayushsarode/VaultDocs/middleware"
	"github.com/ayushsarode/VaultDocs/utils"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()

	if err != nil {
		log.Println(".env file not found")
	}

	if err := utils.InitDB(); err != nil {
		log.Fatalf("failed to connect to MongoDB: %v", err)
	}
	log.Println("Connected to MongoDB")

	// init oauth google
	utils.InitGoogleAuth()
	log.Println("Google OAuth initialized")

	// init gcs
	if err := utils.InitGCS(); err != nil {
		log.Fatalf("failed to initialize Google Cloud Storage: %v", err)
	}
	log.Println("Google Cloud Storage initialized")

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8000"
		log.Println("PORT not set, defaulting to 8000")
	}

	route := gin.Default()

	//cors - improved configuration
	route.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Allow multiple frontend URLs for different environments
		allowedOrigins := []string{
			"http://localhost:3002", // Default Next.js dev server
			"http://localhost:3001", // Alternative port
			"http://127.0.0.1:3003", // Alternative localhost format
		}

		// Check if origin is allowed
		allowed := false
		for _, allowedOrigin := range allowedOrigins {
			if origin == allowedOrigin {
				allowed = true
				break
			}
		}

		if allowed {
			c.Header("Access-Control-Allow-Origin", origin)
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Credentials", "true")

		log.Printf("CORS middleware: %s %s", c.Request.Method, c.Request.URL.Path)

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	route.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})

	route.POST("/register", handlers.Register)
	route.POST("/login", handlers.Login)

	// google auth
	route.GET("/auth/google", handlers.GoogleLogin)
	route.GET("/auth/google/callback", handlers.GoogleCallback)

	// (require authentication)
	protected := route.Group("/api")
	protected.Use(middleware.Authmiddleware())

	// Add debugging middleware
	protected.Use(func(c *gin.Context) {
		log.Printf("Protected route hit: %s %s", c.Request.Method, c.Request.URL.Path)
		c.Next()
	})

	{
		// Folder management
		protected.POST("/folders", handlers.CreateFolder)
		protected.GET("/folders", handlers.GetFolders)
		protected.GET("/folders/all", handlers.GetAllFolders)
		protected.DELETE("/folders/:id", handlers.DeleteFolder)

		// File management
		protected.POST("/files/upload", handlers.UploadFile)
		protected.POST("/files/upload-multiple", handlers.UploadMultipleFiles)
		protected.GET("/files", handlers.GetFiles)
		protected.GET("/files/favorites", handlers.GetFavoriteFiles)
		protected.POST("/files/toggle-favorite/:id", handlers.ToggleFavorite)
		protected.GET("/files/:id/download", handlers.DownloadFile)
		protected.DELETE("/files/:id", handlers.DeleteFile)

		// Test endpoint
		protected.GET("/files/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "test endpoint works"})
		})

		log.Println("Registered route: GET /api/files/favorites")
		log.Println("Registered route: POST /api/files/:id/favorite")

		// Storage info
		protected.GET("/storage", handlers.GetStorageInfo)

		// Profile management
		protected.GET("/profile", handlers.GetProfile)
		protected.DELETE("/profile", handlers.DeleteProfile)
	}

	log.Printf("Starting server on port %s", httpPort)
	if err := route.Run(":" + httpPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
