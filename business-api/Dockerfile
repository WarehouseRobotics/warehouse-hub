FROM node:22-slim

WORKDIR /workspace/business-api

# Install runtime utilities used by local ingestion/OCR.
#RUN apk add git make poppler-utils tesseract-ocr
#RUN apk add git make poppler-utils tesseract-ocr musl musl-dev
RUN apt-get update && apt-get install -y git make poppler-utils tesseract-ocr libtesseract-dev musl musl-dev python3
RUN rm -rf /var/lib/apt/lists/*

COPY business-api/package*.json ./
COPY business-api /workspace/business-api
RUN rm -rf node_modules
COPY packages/business-schemas /workspace/packages/business-schemas/

WORKDIR /workspace/business-api/packages/business-schemas/
RUN npm install -g typescript@5.8.2
RUN npm --prefix /workspace/packages/business-schemas install && npm --prefix /workspace/packages/business-schemas run build

WORKDIR /workspace/business-api

# We need a global typescript install to build the packages/business-schemas package
# --node-llama-cpp-postinstall=skip is used to skip the postinstall script that 
# builds the llama.cpp library that currently produce an error
RUN npm --prefix /workspace/business-api install --node-llama-cpp-postinstall=skip

COPY business-api /workspace/business-api

# Ensure that data/tmp and data/uploads directories are created
RUN mkdir -p data/tmp data/uploads
RUN touch data/tmp/.keep data/uploads/.keep

# Though we're building API, we'll run the dev version for now
RUN rm -rf dist
RUN npm --prefix /workspace/business-api run build
RUN mkdir -p dist/src/db/migrations && cp src/db/migrations/*.sql dist/src/db/migrations/

EXPOSE 3100
