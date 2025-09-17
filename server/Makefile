BINARY_NAME=vaultdocs-server
MAIN_FILE=main.go



# build go binary
.PHONY: build
build:
	@echo "Building ${BINARY_NAME}..."
	go build -o ${BINARY_NAME} ${MAIN_FILE}


# run the server
.PHONY: run
run: 
	@echo "Running ${BINARY_NAME}..."
	./${BINARY_NAME}

.PHONY: clean
clean: 
	@echo "Cleaning up..."
	rm -f ${BINARY_NAME}

.PHONY: tidy
tidy:
	@echo "Tidying up go.mod and go.sum"
	go mod tidy