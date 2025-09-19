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
	if os.Getenv("GIN_MODE") != "release" {
		err := godotenv.Load()
		if err != nil {
			log.Println(".env file not found, using environment variables")
		}
	}

	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	if err := utils.InitDB(); err != nil {
		log.Fatalf("failed to connect to MongoDB: %v", err)
	}

	utils.InitGoogleAuth()

	if err := utils.InitGCS(); err != nil {
		log.Fatalf("failed to initialize Google Cloud Storage: %v", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	route := gin.Default()

	route.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		var allowedOrigins []string

		if gin.Mode() == gin.ReleaseMode {
			allowedOrigins = []string{
				"https://vault-docs-ruddy.vercel.app",
			}
		} else {
			allowedOrigins = []string{
				"http://localhost:3002",
				"http://localhost:3001",
				"http://127.0.0.1:3003",
			}
		}
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

		if gin.Mode() != gin.ReleaseMode {

		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	route.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pon",
		})
	})

	route.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "vaultdocs-backend",
			"mode":    gin.Mode(),
		})

	})

	route.POST("/register", handlers.Register)
	route.POST("/login", handlers.Login)

	route.GET("/auth/google", handlers.GoogleLogin)
	route.GET("/auth/google/callback", handlers.GoogleCallback)

	protected := route.Group("/api")
	protected.Use(middleware.Authmiddleware())

	protected.Use(func(c *gin.Context) {

		c.Next()
	})

	{
		protected.POST("/folders", handlers.CreateFolder)
		protected.GET("/folders", handlers.GetFolders)
		protected.GET("/folders/all", handlers.GetAllFolders)
		protected.DELETE("/folders/:id", handlers.DeleteFolder)

		protected.POST("/files/upload", handlers.UploadFile)
		protected.POST("/files/upload-multiple", handlers.UploadMultipleFiles)
		protected.GET("/files", handlers.GetFiles)
		protected.GET("/files/favorites", handlers.GetFavoriteFiles)
		protected.POST("/files/toggle-favorite/:id", handlers.ToggleFavorite)
		protected.GET("/files/:id/download", handlers.DownloadFile)
		protected.DELETE("/files/:id", handlers.DeleteFile)

		protected.GET("/files/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "test endpoint works"})
		})

		protected.GET("/storage", handlers.GetStorageInfo)

		protected.GET("/profile", handlers.GetProfile)
		protected.DELETE("/profile", handlers.DeleteProfile)
	}
	log.Printf("Starting server on port %s", port)

	if err := http.ListenAndServe(":"+port, route); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
