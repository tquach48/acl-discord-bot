# Small always-on image for the ACL Discord bot.
# Runs on any container host (Fly.io, Koyeb, Oracle Always Free VM, etc.).
FROM node:20-alpine

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source.
COPY . .

# The bot is a long-lived gateway process; no ports to expose.
CMD ["node", "src/index.js"]
