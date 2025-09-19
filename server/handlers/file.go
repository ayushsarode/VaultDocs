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
	MaxFileSize    = 50 * 1024 * 1024
	MaxStorageSize = 2 * 1024 * 1024 * 1024
)

type UploadResult struct {
	File     *models.File `json:"file,omitempty"`
	Error    string       `json:"error,omitempty"`
	Filename string       `json:"filename"`
	Index    int          `json:"index"`
	Success  bool         `json:"success"`
}

func UploadFile(c *gin.Context) {
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

	err = c.Request.ParseMultipartForm(MaxFileSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large or invalid form data"})
		return
	}

	file, fileHeader, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	if fileHeader.Size > MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File size exceeds 50MB limit"})
		return
	}

	if storage.UsedSpace+fileHeader.Size > MaxStorageSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":         "Upload would exceed 2GB storage limit",
			"current_usage": storage.UsedSpace,
			"max_storage":   MaxStorageSize,
		})
		return
	}

	folderIDStr := c.PostForm("folder_id")
	var folderID *primitive.ObjectID
	if folderIDStr != "" {
		folderObjID, err := primitive.ObjectIDFromHex(folderIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}

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

	fileID := primitive.NewObjectID()
	ext := filepath.Ext(fileHeader.Filename)
	gcsFileName := fmt.Sprintf("users/%s/files/%s%s", userIDString, fileID.Hex(), ext)

	file.Seek(0, 0)
	hash := md5.New()
	_, err = io.Copy(hash, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not calculate file hash"})
		return
	}
	fileHash := fmt.Sprintf("%x", hash.Sum(nil))

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

	file.Seek(0, 0)
	gcsURL, err := utils.UploadToGCS(c, gcsFileName, file, fileHeader.Header.Get("Content-Type"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Could not upload file to storage: %v", err)})
		return
	}

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

	_, err = fileCollection.InsertOne(c, fileRecord)
	if err != nil {
		utils.DeleteFromGCS(c, gcsFileName)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save file record"})
		return
	}

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

	err = c.Request.ParseMultipartForm(200 * 1024 * 1024)
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
				"error": fmt.Sprintf("File '%s' exceeds 50MB limit", fileHeader.Filename),
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

	folderIDStr := c.PostForm("folder_id")
	var folderID *primitive.ObjectID
	if folderIDStr != "" {
		folderObjID, err := primitive.ObjectIDFromHex(folderIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}

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

	fileContent, err := io.ReadAll(file)
	if err != nil {
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "Could not read file content",
			Success:  false,
		}
	}

	fileID := primitive.NewObjectID()
	ext := filepath.Ext(fileHeader.Filename)
	gcsFileName := fmt.Sprintf("users/%s/files/%s%s", userIDString, fileID.Hex(), ext)

	var (
		fileHash  string
		gcsURL    string
		uploadErr error
		wg        sync.WaitGroup
	)

	wg.Add(2)

	go func() {
		defer wg.Done()
		hash := md5.New()
		hash.Write(fileContent)
		fileHash = fmt.Sprintf("%x", hash.Sum(nil))
	}()

	go func() {
		defer wg.Done()
		reader := bytes.NewReader(fileContent)
		gcsURL, uploadErr = utils.UploadToGCS(ctx, gcsFileName, reader, fileHeader.Header.Get("Content-Type"))
	}()

	wg.Wait()

	if uploadErr != nil {
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    fmt.Sprintf("Upload to GCS failed: %v", uploadErr),
			Success:  false,
		}
	}

	fileCollection := utils.GetCollection("files")
	var existingFile models.File
	err = fileCollection.FindOne(ctx, bson.M{
		"hash":    fileHash,
		"user_id": userID,
	}).Decode(&existingFile)

	if err == nil {
		go utils.DeleteFromGCS(ctx, gcsFileName)
		return UploadResult{
			Index:    index,
			Filename: fileHeader.Filename,
			Error:    "File already exists (duplicate)",
			File:     &existingFile,
			Success:  false,
		}
	}

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

	_, err = fileCollection.InsertOne(ctx, fileRecord)
	if err != nil {
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
		_ = err
	}
}

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

	if c.Query("redirect") == "true" {
		signedURL, err := utils.GenerateSignedURL(c, file.Path, time.Hour)
		if err != nil {
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

	reader, err := utils.DownloadFromGCS(c, file.Path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not download file"})
		return
	}
	defer reader.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", file.OriginalName))
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Length", fmt.Sprintf("%d", file.Size))

	_, err = io.Copy(c.Writer, reader)
	if err != nil {
		_ = err
	}
}

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

	_, err = collection.DeleteOne(c, bson.M{
		"_id":     fileObjID,
		"user_id": userID,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete file record"})
		return
	}

	err = utils.DeleteFromGCS(c, file.Path)
	if err != nil {
		_ = err
	}

	updateUserStorage(c, userID, -file.Size, 0, -1)

	c.JSON(http.StatusOK, gin.H{"message": "File deleted successfully"})
}

func GetStorageInfo(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	err := recalculateUserStorage(c, userID)
	if err != nil {
		_ = err
	}

	storage, err := getUserStorage(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve storage info"})
		return
	}

	var usagePercentage float64 = 0
	if storage.MaxSpace > 0 {
		usagePercentage = float64(storage.UsedSpace) / float64(storage.MaxSpace) * 100
		if usagePercentage > 100 {
			usagePercentage = 100
		}
		if usagePercentage < 0 || usagePercentage != usagePercentage {
			usagePercentage = 0
		}
	}

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

func getUserStorage(c *gin.Context, userID primitive.ObjectID) (*models.UserStorage, error) {
	collection := utils.GetCollection("user_storage")
	var storage models.UserStorage

	err := collection.FindOne(c, bson.M{"user_id": userID}).Decode(&storage)
	if err != nil {
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

func recalculateUserStorage(c *gin.Context, userID primitive.ObjectID) error {
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

	folderCollection := utils.GetCollection("folders")
	folderCount, err := folderCollection.CountDocuments(c, bson.M{"user_id": userID})
	if err != nil {
		return fmt.Errorf("could not count folders: %v", err)
	}

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

	return nil
}

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
