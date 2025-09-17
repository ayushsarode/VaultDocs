FROM golang:1.25.0 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o vaultdocs-server main.go

# run stage
FROM alpine:3.22.1

WORKDIR /app

COPY --from=builder /app/vaultdocs-server .

EXPOSE 8000

CMD [ "./vaultdocs-server"]