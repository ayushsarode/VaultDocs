# Build stage
FROM golang:1.23 AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o vaultdocs-server main.go

# Runtime stage
FROM alpine:3.19

# Install required packages (curl for healthcheck instead of wget)
RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/vaultdocs-server .

# Create non-root user
RUN adduser -D -s /bin/sh appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8080

# Health check using curl (more reliable than wget in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["./vaultdocs-server"]