# VaultDocs

DriftBox is a cloud storage API that allows users to create folders, upload files (up to 50MB), and manage their storage (2GB limit per user).

## Preview
<img width="1845" height="962" alt="image" src="https://github.com/user-attachments/assets/2319e9f2-7ce4-4753-a217-5551362f1708" />


## Features

- User authentication (email/password + Google OAuth)
- Folder management (create, list, delete)
- File upload to Google Cloud Storage (up to 50MB per file)
- Storage limit enforcement (2GB per user)
- File deduplication using MD5 hashes
- Secure file downloads with proxy streaming (no GCS permission issues)
- Fallback signed URL support for advanced use cases


- `users` - User accounts
- `folders` - Folder structure
- `files` - File metadata
- `user_storage` - Storage usage tracking


<img src="https://api.visitVaultDocsadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fayushsarode%2FVaultDocs&label=visitors&countColor=%2337d67a&style=for-the-badge&labelStyle=upper" />
