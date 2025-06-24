FROM node:18-alpine

# Install git and other build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with exact versions
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the port specified in smithery.yaml
EXPOSE 3000

# Start the server
CMD ["npm", "start"] 