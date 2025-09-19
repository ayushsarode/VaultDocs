# Build stage
FROM golang:1.23 AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o vaultdocs-server main.go

FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /app

COPY --from=builder /app/vaultdocs-server .

RUN adduser -D -s /bin/sh appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8080
 
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["./vaultdocs-server"]