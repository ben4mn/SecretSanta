FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY server/ ./server/
COPY public/ ./public/

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server/index.js"]
