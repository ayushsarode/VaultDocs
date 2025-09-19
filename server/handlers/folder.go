package handlers

import (
	"net/http"
	"time"

	"github.com/ayushsarode/VaultDocs/models"
	"github.com/ayushsarode/VaultDocs/utils"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func CreateFolder(c *gin.Context) {
	var folderRequest struct {
		Name     string `json:"name" binding:"required"`
		ParentID string `json:"parent_id,omitempty"`
	}

	if err := c.ShouldBindJSON(&folderRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	folder := models.Folder{
		ID:        primitive.NewObjectID(),
		Name:      folderRequest.Name,
		UserID:    userID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if folderRequest.ParentID != "" {
		parentID, err := primitive.ObjectIDFromHex(folderRequest.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent folder ID"})
			return
		}

		collection := utils.GetCollection("folders")
		var parentFolder models.Folder
		err = collection.FindOne(c, bson.M{
			"_id":     parentID,
			"user_id": userID,
		}).Decode(&parentFolder)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Parent folder not found"})
			return
		}

		folder.ParentID = &parentID
		folder.Path = parentFolder.Path + "/" + folderRequest.Name
	} else {
		folder.Path = "/" + folderRequest.Name
	}

	collection := utils.GetCollection("folders")
	var existingFolder models.Folder
	err = collection.FindOne(c, bson.M{
		"name":      folderRequest.Name,
		"user_id":   userID,
		"parent_id": folder.ParentID,
	}).Decode(&existingFolder)

	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Folder with this name already exists"})
		return
	}

	_, err = collection.InsertOne(c, folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create folder"})
		return
	}

	updateUserStorage(c, userID, 0, 1, 0)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Folder created successfully",
		"folder":  folder,
	})
}

func GetFolders(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	parentID := c.Query("parent_id")
	filter := bson.M{"user_id": userID}

	if parentID != "" {
		parentObjID, err := primitive.ObjectIDFromHex(parentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent folder ID"})
			return
		}
		filter["parent_id"] = parentObjID
	} else {
		filter["parent_id"] = bson.M{"$exists": false}
	}

	collection := utils.GetCollection("folders")
	cursor, err := collection.Find(c, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve folders"})
		return
	}
	defer cursor.Close(c)

	var folders []models.Folder
	if err = cursor.All(c, &folders); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not decode folders"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"folders": folders})
}

func GetAllFolders(c *gin.Context) {
	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	filter := bson.M{"user_id": userID}

	collection := utils.GetCollection("folders")
	cursor, err := collection.Find(c, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not retrieve folders"})
		return
	}
	defer cursor.Close(c)

	var folders []models.Folder
	if err = cursor.All(c, &folders); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not decode folders"})
		return
	}

	c.JSON(http.StatusOK, folders)
}

func DeleteFolder(c *gin.Context) {
	folderID := c.Param("id")
	folderObjID, err := primitive.ObjectIDFromHex(folderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}

	userIDInterface, _ := c.Get("userID")
	userIDString := userIDInterface.(string)
	userID, _ := primitive.ObjectIDFromHex(userIDString)

	collection := utils.GetCollection("folders")

	var folder models.Folder
	err = collection.FindOne(c, bson.M{
		"_id":     folderObjID,
		"user_id": userID,
	}).Decode(&folder)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	_, err = collection.DeleteOne(c, bson.M{
		"_id":     folderObjID,
		"user_id": userID,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete folder"})
		return
	}

	updateUserStorage(c, userID, 0, -1, 0)

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted successfully"})
}

func updateUserStorage(c *gin.Context, userID primitive.ObjectID, sizeChange int64, folderChange int, fileChange int) {
	collection := utils.GetCollection("user_storage")

	var storage models.UserStorage
	err := collection.FindOne(c, bson.M{"user_id": userID}).Decode(&storage)

	if err != nil {
		storage = models.UserStorage{
			UserID:      userID,
			UsedSpace:   sizeChange,
			MaxSpace:    2147483648,
			FileCount:   fileChange,
			FolderCount: folderChange,
			UpdatedAt:   time.Now(),
		}
		collection.InsertOne(c, storage)
	} else {
		update := bson.M{
			"$inc": bson.M{
				"used_space":   sizeChange,
				"file_count":   fileChange,
				"folder_count": folderChange,
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		}
		collection.UpdateOne(c, bson.M{"user_id": userID}, update)
	}
}
