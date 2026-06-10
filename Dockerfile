# --- Etapa 1: build (Node + Vite) -------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# instalăm dependențele separat de surse, ca stratul să fie cache-uit între build-uri
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Etapa 2: servire (nginx, doar fișierele statice) -----------------------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
