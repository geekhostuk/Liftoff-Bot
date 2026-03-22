FROM node:23-alpine

WORKDIR /app

# Install dependencies first (layer-cached unless package files change)
COPY Server/package*.json ./
RUN npm ci --only=production

# Copy app source
COPY Server/src/ ./src/
COPY contracts/ ./contracts/

EXPOSE 3000

# Default CMD — override in docker-compose per service
CMD ["node", "src/index.js"]
