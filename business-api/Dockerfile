FROM node:22-slim

WORKDIR /app

# Install runtime utilities used by local ingestion/OCR.
#RUN apk add git make poppler-utils tesseract-ocr
#RUN apk add git make poppler-utils tesseract-ocr musl musl-dev
RUN apt-get update && apt-get install -y git make poppler-utils tesseract-ocr libtesseract-dev musl musl-dev
RUN rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# --node-llama-cpp-postinstall=skip is used to skip the postinstall script that 
# builds the llama.cpp library that currently produce an error
RUN rm -rf node_modules && npm install --node-llama-cpp-postinstall=skip

COPY . .

RUN npm run build
RUN mkdir -p dist/src/db/migrations && cp src/db/migrations/*.sql dist/src/db/migrations/

EXPOSE 3100

CMD ["npm", "run", "start"]
