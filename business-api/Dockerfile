FROM node:22-alpine

WORKDIR /app

# Install git
RUN apk add git make

COPY package*.json ./

# --node-llama-cpp-postinstall=skip is used to skip the postinstall script that 
# builds the llama.cpp library that currently produce an error
RUN npm install --node-llama-cpp-postinstall=skip

COPY . .

RUN npm run build
RUN mkdir -p dist/src/db/migrations && cp src/db/migrations/*.sql dist/src/db/migrations/

EXPOSE 3100

CMD ["npm", "run", "start"]
