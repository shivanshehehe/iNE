FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV HEADLESS=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

EXPOSE 10000
CMD ["node", "src/index.js"]
