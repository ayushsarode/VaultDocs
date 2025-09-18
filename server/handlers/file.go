package handlers

import (
	"bytes"
	"context"
	"crypto/md5"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/ayushsarode/VaultDocs/models"
	"github.com/ayushsarode/VaultDocs/utils"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	MaxFileSize    = 50 * 1024 * 1024       // 50MB in bytes
	MaxStorageSize = 2 * 1024 * 1024 * 1024 // 2GB in bytes
)

type UploadResult struct {
	File     *models.File `json:"file,omitempty"`
	Error    string       `json:"error,omitempty"`
	Filename string       `json:"filename"`
	Index    int          `json:"index"`
	Success  bool         `json:"success"`
}

// UploadFile handles file upload to Google Cloud Storage
func UploadFile(c *gin.Context) {
	// Get user ID from middleware
	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	userIDString := userIDInterface.(string)
	userID, err := primitive.ObjectIDFromHex(userIDString)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check user's current storage usage
	storage, err := getUserStorage(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not check storage usage"})
		return
	}

	// Parse multipart form
	err = c.Request.ParseMultipartForm(MaxFileSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large or invalid form data"})
		return
	}

	// Get file from form
	file, fileHeader, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Check file size
	if fileHeader.Size > MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File size exceeds 50MB limit"})
		return
	}

	// Check if upload would exceed storage limit
	if storage.UsedSpace+fileHeader.Size > MaxStorageSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":         "Upload would exceed 2GB storage limit",
			"current_usage": storage.UsedSpace,
			"max_storage":   MaxStorageSize,
		})
		return
	}

	// Get folder ID if provided
	folderIDStr := c.PostForm("folder_id")
	var folderID *primitive.ObjectID
	if folderIDStr != "" {
		folderObjID, err := primitive.ObjectIDFromHex(folderIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}

		// Verify folder exists and belongs to user
		folderCollection := utils.GetCollection("folders")
		var folder models.Folder
		err = folderCollection.FindOne(c, bson.M{
			"_id":     folderObjID,
			"user_id": userID,
		}).Decode(&folder)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
			return
		}
		folderID = &folderObjID
	}

	// Generate unique filename for GCS
	fileID := primitive.NewObjectID()
	ext := filepath.Ext(fileHeader.Filename)
	gcsFileName := fmt.Sprintf("users/%s/files/%s%s", userIDString, fileID.Hex(), ext)

	// Calculate file hash for deduplication
	file.Seek(0, 0) // Reset file pointer
	hash := md5.New()
	_, err = io.Copy(hash, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not calculate file hash"})
		return
	}
	fileHash := fmt.Sprintf("%x", hash.Sum(nil))

	// Check if file already exists (deduplication)
	fileCollection := utils.GetCollection("files")
	var existingFile models.File
	err = fileCollection.FindOne(c, bson.M{
		"hash":    fileHash,
		"user_id": userID,
	}).Decode(&existingFile)

	if err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":         "File already exists",
			"existing_file": existingFile,
		})
		return
	}

	// Upload file to Google Cloud Storage
	file.Seek(0, 0) // Reset file pointer
	gcsURL, err := utils.UploadToGCS(c, gcsFileName, file, fileHeader.Header.Get("Content-Type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Could not upload file to storage: %v", err)})
		return
	}

	// Create file record in database
	fileRecord := models.File{
		ID:           fileID,
		Name:         fileHeader.Filename,
		OriginalName: fileHeader.Filename,
		Size:         fileHeader.Size,
		ContentType:  fileHeader.Header.Get("Content-Type"),
		UserID:       userID,
		FolderID:     folderID,
		Path:         gcsFileName, // Store GCS path instead of local path
		URL:          gcsURL,
		Hash:         fileHash,
		IsFavorite:   false, // Default to not favorited
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	_, err = fileCollection.InsertOne(c, fileRecord)
	if err != nil {
		// Clean up GCS file if database insert fails
		utils.DeleteFromGCS(c, gcsFileName)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save file record"})
		return
	}

	// Update user storage stats
	updateUserStorage(c, userID, fileHeader.Size, 0, 1)

	c.JSON(http.StatusCreated, gin.H{
		"message": "File uploaded successfully",
		"file":    fileRecord,
	})
}

func UploadMultipleFiles(c *gin.Context) {
	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	userIDString := userIDInterface.(string)

	userID, err := primitive.ObjectIDFromHex(userIDString)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	storage, err := getUserStorage(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not check storage usage"})
		return
	}

	err = c.Request.ParseMultipartForm(200 * 1024 * 1024) // 200MB total
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Form too large or invalid form data"})
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
		return
	}

	var totalSize int64
	for _, fileHeader := range files {
		if fileHeader.Size > MaxFileSize {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprint("File '%s' exceeds 50MB limit", fileHeader.Filename),
			})
			return
		}
		totalSize += fileHeader.Size
	}

	if storage.UsedSpace+totalSize > MaxStorageSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":         "Upload would exceed 2GB storage limit",
			"current_usage": storage.UsedSpace,
			"total_upload":  totalSize,
			"max_storage":   MaxStorageSize,
		})
		return
	}

	// Get folder ID if provided
	folderIDStr := c.PostForm("folder_id")
	var folderID *primitive.ObjectID
	if folderIDStr != "" {
		folderObjID, err := primitive.ObjectIDFromHex(folderIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}

		// Verify folder exists and belongs to user
		folderCollection := utils.GetCollection("folders")
		var folder models.Folder
		err = folderCollection.FindOne(c, bson.M{
			"_id":     folderObjID,
			"user_id": userID,
		}).Decode(&folder)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
			return
		}
		folderID = &folderObjID
	}

	maxConcurrent := 5
	semaphore := make(chan struct{}, maxConcurrent)

	var wg sync.WaitGroup
	results := make([]UploadResult, len(files))

	for i, fileHeader := range files {
		wg.Add(1)

		go func(index int, fh *multipart.FileHeader) {
			defer wg.Done()

			semaphore <- struct{}{}

			defer func() { <-semaphore }()

			result := uploadSingleFileAsync(c.Request.Context(), fh, userID, userIDString, folderID, index)
			results[index] = result
		}(i, fileHeader)
	}

	wg.Wait()

	var successful, failed int
	var successfulFiles []models.File
	var errors []string
	var totalUploaded int64

	for _, result := range results {
		if result.Success {
			successful++
			if result.File != nil {
				successfulFiles = append(successfulFiles, *result.File)
				totalUploaded += result.File.Size
			}
		} else {
			failed++
			errors = append(errors, fmt.Sprintf("%s: %s", result.Filename, result.Error))
		}
	}

	if successful > 0 {
		go updateUserStorageAsync(c.Request.Context(), userID, totalUploaded, 0, int64(successful))
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          fmt.Sprintf("Upload completed: %d successful, %d failed", successful, failed),
		"successful":       successful,
		"failed":           failed,
		"successful_files": successfulFiles,
		"errors":           errors,
		"total_uploaded":   totalUploaded,
	})

}

func uploadSingleFileAsync(ctx context.Context, fileHeader *multipart.FileHeader, userID primitive.ObjectID, userIDString string, folderID *primitive.ObjectID, index int) UploadResult {
	// Open file
	file, err := fileHeader.Open()
	if err != nil {
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "Could not open file",
			Success:  false,
		}
	}
	defer file.Close()

	// Read file content once
	fileContent, err := io.ReadAll(file)
	if err != nil {
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "Could not read file content",
			Success:  false,
		}
	}

	// Generate unique filename for GCS
	fileID := primitive.NewObjectID()
	ext := filepath.Ext(fileHeader.Filename)
	gcsFileName := fmt.Sprintf("users/%s/files/%s%s", userIDString, fileID.Hex(), ext)

	// Use goroutines for parallel hash calculation and GCS upload
	var (
		fileHash  string
		gcsURL    string
		uploadErr error
		wg        sync.WaitGroup
	)

	wg.Add(2)

	// Goroutine 1: Calculate file hash
	go func() {
		defer wg.Done()
		hash := md5.New()
		hash.Write(fileContent)
		fileHash = fmt.Sprintf("%x", hash.Sum(nil))
	}()

	// Goroutine 2: Upload to GCS
	go func() {
		defer wg.Done()
		reader := bytes.NewReader(fileContent)
		gcsURL, uploadErr = utils.UploadToGCS(ctx, gcsFileName, reader, fileHeader.Header.Get("Content-Type"))
	}()

	// Wait for both operations to complete
	wg.Wait()

	if uploadErr != nil {
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    fmt.Sprintf("Upload to GCS failed: %v", uploadErr),
			Success:  false,
		}
	}

	// Check for duplicates
	fileCollection := utils.GetCollection("files")
	var existingFile models.File
	err = fileCollection.FindOne(ctx, bson.M{
		"hash":    fileHash,
		"user_id": userID,
	}).Decode(&existingFile)

	if err == nil {
		// File already exists, clean up GCS and return existing file info
		go utils.DeleteFromGCS(ctx, gcsFileName)
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "File already exists (duplicate)",
			File:     &existingFile,
			Success:  false,
		}
	}

	// Create file record
	fileRecord := models.File{
		ID:           fileID,
		Name:         fileHeader.Filename,
		OriginalName: fileHeader.Filename,
		Size:         fileHeader.Size,
		ContentType:  fileHeader.Header.Get("Content-Type"),
		UserID:       userID,
		FolderID:     folderID,
		Path:         gcsFileName,
		URL:          gcsURL,
		Hash:         fileHash,
		IsFavorite:   false,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Save to database
	_, err = fileCollection.InsertOne(ctx, fileRecord)
	if err != nil {
		// Clean up GCS file if database insert fails
		go utils.DeleteFromGCS(ctx, gcsFileName)
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "Could not save file record to database",
			Success:  false,
		}
	}

	return UploadResult{
		Index:    index,
		Filename: fileHeader.Filename,
		File:     &fileRecord,
		Success:  true,
	}
}

func updateUserStorageAsync(ctx context.Context, userID primitive.ObjectID, sizeChange int64, folderChange int64, fileChange int64) {
	collection := utils.GetCollection("user_storage")

	// Use upsert to create if doesn't exist
	_, err := collection.UpdateOne(ctx,
		bson.M{"user_id": userID},
		bson.M{
			"$inc": bson.M{
				"used_space":   sizeChange,
				"file_count":   fileChange,
				"folder_count": folderChange,
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
			"$setOnInsert": bson.M{
				"user_id":   userID,
				"max_space": MaxStorageSize,
			},
		},
		options.Update().SetUpsert(true),
	)

	if err != nil {
		// Silent error handling - could log to proper logger in production
		_ = err
	}
}

// GetFiles retrieves files for the authenticated user
func GetFiles(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	folderID := c.Query("folder_id")
	filter := bson.M{"user_id": userID}

	if folderID != "" {
		folderObjID, err := primitive.ObjectIDFromHex(folderID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}
		filter["folder_id"] = folderObjID
	} else {
		// For root folder, get files where folder_id is null or doesn't exist
		filter["$or"] = []bson.M{
			{"folder_id": bson.M{"$exists": false}},
			{"folder_id": nil},
		}
	}

	collection := utils.GetCollection("files")
	cursor, err := collection.Find(c, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve files"})
		return
	}
	defer cursor.Close(c)

	var files []models.File
	if err = cursor.All(c, &files); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not decode files"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"files": files})
}

// DownloadFile handles file download using proxy method by default, with signed URL fallback
func DownloadFile(c *gin.Context) {
	fileID := c.Param("id")
	fileObjID, err := primitive.ObjectIDFromHex(fileID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
		return
	}

	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	// Find file record
	collection := utils.GetCollection("files")
	var file models.File
	err = collection.FindOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	}).Decode(&file)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Check if signed URL is explicitly requested
	if c.Query("redirect") == "true" {
		// Try to generate signed URL for redirect
		signedURL, err := utils.GenerateSignedURL(c, file.Path, time.Hour)
		if err != nil {
			// If signed URL generation fails, fall back to proxy download
			c.JSON(http.StatusOK, gin.H{
				"download_url": fmt.Sprintf("/api/files/%s/download", fileID),
				"expires_in":   "session",
				"method":       "proxy",
				"note":         "Signed URL failed, use direct download",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"download_url": signedURL,
			"expires_in":   "1 hour",
			"method":       "signed_url",
		})
		return
	}

	// Default behavior: Direct proxy download through our server
	reader, err := utils.DownloadFromGCS(c, file.Path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not download file"})
		return
	}
	defer reader.Close()

	// Set appropriate headers for file download
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", file.OriginalName))
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Length", fmt.Sprintf("%d", file.Size))

	// Stream the file directly to the client
	_, err = io.Copy(c.Writer, reader)
	if err != nil {
		// Silent error handling - headers already sent
		_ = err
	}
}

// DeleteFile deletes a file from GCS and database
func DeleteFile(c *gin.Context) {
	fileID := c.Param("id")
	fileObjID, err := primitive.ObjectIDFromHex(fileID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
		return
	}

	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	// Find file record
	collection := utils.GetCollection("files")
	var file models.File
	err = collection.FindOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	}).Decode(&file)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Delete file from database first
	_, err = collection.DeleteOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete file record"})
		return
	}

	// Delete file from Google Cloud Storage
	err = utils.DeleteFromGCS(c, file.Path)
	if err != nil {
		// Silent error handling - DB record is already deleted
		_ = err
	}

	// Update user storage stats
	updateUserStorage(c, userID, -file.Size, 0, -1)

	c.JSON(http.StatusOK, gin.H{"message": "File deleted successfully"})
}

// GetStorageInfo returns user's storage usage information
func GetStorageInfo(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	// Recalculate storage from actual files to ensure accuracy
	err := recalculateUserStorage(c, userID)
	if err != nil {
		// Continue with cached data if recalculation fails
		_ = err
	}

	storage, err := getUserStorage(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve storage info"})
		return
	}

	// Calculate usage percentage safely to avoid +Inf
	var usagePercentage float64 = 0
	if storage.MaxSpace > 0 {
		usagePercentage = float64(storage.UsedSpace) / float64(storage.MaxSpace) * 100
		// Ensure the percentage is not infinite or NaN
		if usagePercentage > 100 {
			usagePercentage = 100
		}
		if usagePercentage < 0 || usagePercentage != usagePercentage { // NaN check
			usagePercentage = 0
		}
	}

	// Return storage data directly (not nested under "storage" key)
	c.JSON(http.StatusOK, gin.H{
		"user_id":          storage.UserID,
		"used_space":       storage.UsedSpace,
		"max_space":        storage.MaxSpace,
		"file_count":       storage.FileCount,
		"folder_count":     storage.FolderCount,
		"updated_at":       storage.UpdatedAt,
		"usage_percentage": usagePercentage,
	})
}

// Helper function to get user storage information
func getUserStorage(c *gin.Context, userID primitive.ObjectID) (*models.UserStorage, error) {
	collection := utils.GetCollection("user_storage")
	var storage models.UserStorage

	err := collection.FindOne(c, bson.M{"user_id": userID}).Decode(&storage)
	if err != nil {
		// Create default storage record if it doesn't exist
		storage = models.UserStorage{
			UserID:      userID,
			UsedSpace:   0,
			MaxSpace:    MaxStorageSize,
			FileCount:   0,
			FolderCount: 0,
			UpdatedAt:   time.Now(),
		}
		collection.InsertOne(c, storage)
	}

	return &storage, nil
}

// recalculateUserStorage recalculates storage from actual files and folders
func recalculateUserStorage(c *gin.Context, userID primitive.ObjectID) error {
	// Calculate total file size and count
	fileCollection := utils.GetCollection("files")
	pipeline := []bson.M{
		{"$match": bson.M{"user_id": userID}},
		{"$group": bson.M{
			"_id":       nil,
			"totalSize": bson.M{"$sum": "$size"},
			"fileCount": bson.M{"$sum": 1},
		}},
	}

	cursor, err := fileCollection.Aggregate(c, pipeline)
	if err != nil {
		return fmt.Errorf("could not aggregate file sizes: %v", err)
	}
	defer cursor.Close(c)

	var result struct {
		TotalSize int64 `bson:"totalSize"`
		FileCount int   `bson:"fileCount"`
	}

	if cursor.Next(c) {
		if err := cursor.Decode(&result); err != nil {
			return fmt.Errorf("could not decode aggregation result: %v", err)
		}
	}

	// Count folders
	folderCollection := utils.GetCollection("folders")
	folderCount, err := folderCollection.CountDocuments(c, bson.M{"user_id": userID})
	if err != nil {
		return fmt.Errorf("could not count folders: %v", err)
	}

	// Update storage record
	storageCollection := utils.GetCollection("user_storage")
	_, err = storageCollection.UpdateOne(
		c,
		bson.M{"user_id": userID},
		bson.M{
			"$set": bson.M{
				"used_space":   result.TotalSize,
				"file_count":   result.FileCount,
				"folder_count": int(folderCount),
				"updated_at":   time.Now(),
			},
		},
		options.Update().SetUpsert(true),
	)

	if err != nil {
		return fmt.Errorf("could not update storage record: %v", err)
	}

	// Storage recalculated successfully

	return nil
}

// ToggleFavorite toggles the favorite status of a file
func ToggleFavorite(c *gin.Context) {
	fileID := c.Param("id")

	fileObjID, err := primitive.ObjectIDFromHex(fileID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
		return
	}

	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	userIDString := userIDInterface.(string)
	userID, err := primitive.ObjectIDFromHex(userIDString)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Find file record
	collection := utils.GetCollection("files")
	var file models.File
	err = collection.FindOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	}).Decode(&file)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Toggle favorite status
	newFavoriteStatus := !file.IsFavorite
	_, err = collection.UpdateOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	}, bson.M{
		"$set": bson.M{
			"is_favorite": newFavoriteStatus,
			"updated_at":  time.Now(),
		},
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update file"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "File favorite status updated",
		"is_favorite": newFavoriteStatus,
	})
}

// GetFavoriteFiles retrieves all favorite files for the authenticated user
func GetFavoriteFiles(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	collection := utils.GetCollection("files")
	cursor, err := collection.Find(c, bson.M{
		"user_id":     userID,
		"is_favorite": true,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve favorite files"})
		return
	}
	defer cursor.Close(c)

	var files []models.File
	if err = cursor.All(c, &files); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not decode favorite files"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"files": files})
}
