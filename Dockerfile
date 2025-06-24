FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the port specified in smithery.yaml
EXPOSE 3000

# Start the server
CMD ["npm", "start"] 