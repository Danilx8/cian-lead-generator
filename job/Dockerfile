# Use Node base with necessary OS libraries
FROM node:20-slim

# Set Puppeteer cache directory to a persistent location
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Install system dependencies for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing ca-certificates \
    wget \
    unzip \
    curl \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/.cache/puppeteer \
    && chown -R pptruser:pptruser /home/pptruser

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage cache
COPY package*.json ./

# Install dependencies (including Puppeteer)
RUN npm ci --omit=dev

# Install Puppeteer browsers (cacheable if package.json and PUPPETEER_CACHE_DIR are unchanged)
RUN PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer npx puppeteer install

# Install TypeScript globally
RUN npm install -g typescript

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Switch to non-root user
USER pptruser

# Command to run the app (adjust as needed)
CMD ["node", "dist/index.js"]