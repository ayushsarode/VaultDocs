package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"github.com/ayushsarode/VaultDocs/models"
	"github.com/ayushsarode/VaultDocs/utils"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)         
          
func Register(c *gin.Context) {
	var user models.User

	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not hash password"})
	}

	user.Password = string(hashedPassword)
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	collection := utils.GetCollection("users")

	_, err = collection.InsertOne(c, user)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully"})
}

func Login(c *gin.Context) {
	var user models.User

	// Bind incoming JSON (email & password)
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dbUser models.User

	// Fetch user by email
	collection := utils.GetCollection("users")
	err := collection.FindOne(c, gin.H{"email": user.Email}).Decode(&dbUser)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Compare passwords
	if err := bcrypt.CompareHashAndPassword([]byte(dbUser.Password), []byte(user.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Generate JWT token
	token, err := utils.GenerateToken(dbUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
		return
	}

	// Respond with token and user data
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":    dbUser.ID.Hex(),
			"name":  dbUser.Username,
			"email": dbUser.Email,
		},
	})
}

func GoogleLogin(c *gin.Context) {
	// Generate random state string
	state := generateRandomState()

	// Store state in session or cache (simplified here)
	c.SetCookie("oauth_state", state, 300, "/", "", false, true)

	url := utils.GoogleOAuthConfig.AuthCodeURL(state)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func GoogleCallback(c *gin.Context) {
	log.Println("GoogleCallback called")

	// Verify state parameter
	state := c.Query("state")
	storedState, err := c.Cookie("oauth_state")
	log.Printf("State: %s, StoredState: %s", state, storedState)

	if err != nil {
		log.Printf("Failed to get stored state cookie: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing state cookie"})
		return
	}

	if state != storedState {
		log.Printf("State verification failed: received '%s', expected '%s'", state, storedState)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid state parameter"})
		return
	}

	// Clear the state cookie
	c.SetCookie("oauth_state", "", -1, "/", "", false, true)

	// Exchange code for token
	code := c.Query("code")
	if code == "" {
		log.Printf("No authorization code received")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing authorization code"})
		return
	}

	log.Printf("Exchanging code for token...")
	token, err := utils.GoogleOAuthConfig.Exchange(c, code)
	if err != nil {
		log.Printf("Failed to exchange code for token: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to exchange code for token: %v", err)})
		return
	}

	// Get user info from Google
	googleUser, err := utils.GetGoogleUserInfo(token)
	if err != nil {
		log.Printf("Failed to get Google user info: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info from Google"})
		return
	}

	log.Printf("Google user info: %+v", googleUser)

	// Check if user exists in database
	collection := utils.GetCollection("users")
	var existingUser models.User

	err = collection.FindOne(c, bson.M{"email": googleUser.Email}).Decode(&existingUser)

	if err != nil {
		// User doesn't exist, create new user
		log.Printf("User not found, creating new user: %s", googleUser.Email)
		newUser := models.User{
			ID:           primitive.NewObjectID(),
			Username:     googleUser.Name,
			Email:        googleUser.Email,
			GoogleID:     googleUser.ID,
			Picture:      googleUser.Picture,
			AuthProvider: "google",
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}

		log.Printf("Attempting to insert user: %+v", newUser)
		_, err = collection.InsertOne(c, newUser)
		if err != nil {
			log.Printf("Failed to create user: %v", err)
			// Check if this is a duplicate key error (user already exists)
			if mongo.IsDuplicateKeyError(err) || strings.Contains(err.Error(), "duplicate key") {
				log.Printf("User already exists, trying to find existing user")
				// Try to find the existing user
				err = collection.FindOne(c, bson.M{"email": googleUser.Email}).Decode(&existingUser)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "User exists but could not retrieve"})
					return
				}
				log.Printf("Found existing user: %s", existingUser.Email)
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Could not create user: %v", err)})
				return
			}
		} else {
			log.Printf("Successfully created user: %s", newUser.Email)
			existingUser = newUser
		}
	} else {
		log.Printf("User already exists: %s", existingUser.Email)
		// User exists, update Google ID if not set
		if existingUser.GoogleID == "" {
			log.Printf("Updating existing user with Google ID")
			update := bson.M{
				"$set": bson.M{
					"google_id":     googleUser.ID,
					"picture":       googleUser.Picture,
					"auth_provider": "google",
				},
			}
			_, err = collection.UpdateOne(c, bson.M{"_id": existingUser.ID}, update)
			if err != nil {
				log.Printf("Failed to update user: %v", err)
			} else {
				// Update the local existingUser object
				existingUser.GoogleID = googleUser.ID
				existingUser.Picture = googleUser.Picture
				existingUser.AuthProvider = "google"
			}
		}
	}

	// Generate JWT token
	jwtToken, err := utils.GenerateToken(existingUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
		return
	}

	// Redirect to frontend with token instead of JSON response
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3001" // Default fallback
	}
	redirectURL := fmt.Sprintf("%s/auth/callback?token=%s&user=%s",
		frontendURL,
		jwtToken,
		existingUser.ID.Hex())

	log.Printf("Redirecting to: %s", redirectURL)
	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}

func generateRandomState() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

func GetProfile(c *gin.Context) {
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

	collection := utils.GetCollection("users")
	var user models.User
	err = collection.FindOne(c, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID.Hex(),
		"name":       user.Username,
		"email":      user.Email,
		"avatar_url": user.Picture,
		"created_at": user.CreatedAt,
	})
}

func DeleteProfile(c *gin.Context) {
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

	// Delete all user files from GCS first
	fileCollection := utils.GetCollection("files")
	filesCursor, err := fileCollection.Find(c, bson.M{"user_id": userID})
	if err == nil {
		defer filesCursor.Close(c)
		var files []models.File
		if err = filesCursor.All(c, &files); err == nil {
			for _, file := range files {
				utils.DeleteFromGCS(c, file.Path)
			}
		}
	}

	// Delete all user files from database
	_, err = fileCollection.DeleteMany(c, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete user files"})
		return
	}

	// Delete all user folders
	folderCollection := utils.GetCollection("folders")
	_, err = folderCollection.DeleteMany(c, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete user folders"})
		return
	}

	// Delete user storage record
	storageCollection := utils.GetCollection("user_storage")
	_, err = storageCollection.DeleteMany(c, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete user storage"})
		return
	}

	// Finally delete the user
	userCollection := utils.GetCollection("users")
	_, err = userCollection.DeleteOne(c, bson.M{"_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete user account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Account deleted successfully"})
}
