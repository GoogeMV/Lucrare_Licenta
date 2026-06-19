# Backend NotationSoft (Node + Express). Rulează direct, fără pas de build.
FROM node:22-alpine
WORKDIR /app

# dependențele separat de surse, pentru cache între build-uri
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
