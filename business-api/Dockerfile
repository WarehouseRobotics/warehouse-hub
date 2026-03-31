FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build
RUN mkdir -p dist/src/db/migrations && cp src/db/migrations/*.sql dist/src/db/migrations/

EXPOSE 3100

CMD ["npm", "run", "start"]
